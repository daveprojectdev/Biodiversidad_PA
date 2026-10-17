// ============================================================
// Atlas vivo — la página de la versión en la nube.
// Habla con el Worker en la misma dirección: GET /explorar,
// POST /consultar y, para la voz, POST /transcribir y POST /hablar
// (ver nube/worker/README.md).
// ============================================================

const COLECCIONES = {
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

const OCULTAS = new Set(["occurrence_url", "media_type"]);
// Números que no son cantidades: no se suman, no se pintan y se muestran tal cual.
const NO_CANTIDAD = new Set(["latitud", "longitud", "gbif_id", "anio", "mes"]);
const $ = (id) => document.getElementById(id);

const estado = {
  coleccion: "anfibios",
  panorama: {}, // por colección: respuesta de /explorar
  historial: [], // { pregunta, coleccion, datos }
  actual: null,
};

// ── Utilidades ──

const formato = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
const num = (n) => (typeof n === "number" ? formato.format(n) : String(n));

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Compara nombres sin mayúsculas ni acentos, como la base.
const clave = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function etiqueta(columna) {
  const t = columna.replaceAll("_", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Mapa ──

let caminos = []; // { path, nombres: Set de claves }

async function cargarMapa() {
  const svg = await (await fetch("/mapa-panama.svg")).text();
  $("mapa").innerHTML = svg;
  caminos = [...$("mapa").querySelectorAll("path")].map((path) => {
    const nombres = [path.dataset.provincia, ...(path.dataset.alias ? path.dataset.alias.split("|") : [])];
    const titulo = document.createElementNS("http://www.w3.org/2000/svg", "title");
    path.appendChild(titulo);
    return { path, titulo, nombres: new Set(nombres.map(clave)) };
  });
}

function caminoDe(provincia) {
  const k = clave(provincia);
  return caminos.find((c) => c.nombres.has(k));
}

// valores: Map provincia -> número (o null si solo importa que aparezca)
function pintarMapa(valores, unidad) {
  const svg = $("mapa").querySelector("svg");
  if (!svg) return;
  svg.querySelectorAll("text").forEach((t) => t.remove());
  const porCamino = new Map();
  const fuera = [];
  for (const [provincia, valor] of valores) {
    const c = caminoDe(provincia);
    if (!c) {
      fuera.push(valor == null ? provincia : `${provincia} (${num(valor)})`);
      continue;
    }
    // Kuna Yala y San Blas son la misma Guna Yala: se suman.
    const previo = porCamino.get(c);
    porCamino.set(c, valor == null ? previo ?? null : (previo ?? 0) + valor);
  }
  const numeros = [...porCamino.values()].filter((v) => v != null).sort((a, b) => a - b);
  const maximo = Math.max(1, ...numeros);
  const mediana = numeros.length ? numeros[Math.floor(numeros.length / 2)] : 1;
  // Si una provincia aplasta al resto (731 contra 1), la escala lineal pinta
  // casi todo igual: ahí va logarítmica. Si los valores son parejos, lineal.
  const logaritmica = maximo / Math.max(1, mediana) > 8;
  const proporcion = (v) => (logaritmica ? Math.log1p(v) / Math.log1p(maximo) : v / maximo);
  for (const c of caminos) {
    const tiene = porCamino.has(c);
    const v = porCamino.get(c);
    const nivel = !tiene ? 0 : v == null ? 3 : Math.max(1, Math.ceil(4 * proporcion(v)));
    c.path.dataset.nivel = String(nivel);
    const nombre = c.path.dataset.provincia;
    c.titulo.textContent = tiene ? (v == null ? nombre : `${nombre}: ${num(v)} ${unidad}`) : `${nombre}: sin datos`;
    if (tiene && v != null) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", c.path.dataset.cx);
      t.setAttribute("y", c.path.dataset.cy);
      t.textContent = num(v);
      svg.appendChild(t);
    }
  }
  const p = $("fuera-mapa");
  p.hidden = fuera.length === 0;
  p.textContent = fuera.length ? `Fuera del mapa: ${fuera.join(", ")}.` : "";
}

// ── Panorama de la colección (sin modelo, sin gastar cuota) ──

// Primero el JSON estático (npm run panorama), que no despierta a Neon; si
// falta, /explorar. Se guarda la promesa para no pedirlo dos veces.
async function pedirPanorama(api) {
  for (const url of [`/panorama-${api}.json`, `/explorar?coleccion=${api}`]) {
    try {
      const r = await fetch(url);
      const datos = await r.json();
      if (r.ok && !datos.error) return datos;
    } catch {}
  }
  throw new Error("sin panorama");
}

function cargarPanorama(coleccion) {
  estado.panorama[coleccion] ??= pedirPanorama(COLECCIONES[coleccion].api).catch((e) => {
    delete estado.panorama[coleccion];
    throw e;
  });
  return estado.panorama[coleccion];
}

function mostrarPanorama(datos) {
  const nombre = COLECCIONES[estado.coleccion].nombre;
  $("titulo-mapa").textContent = `Especies de ${nombre} por provincia`;
  $("nota-mapa").textContent = `${num(datos.total_avistamientos)} avistamientos · ${datos.rango_anios}`;
  pintarMapa(new Map(datos.provincias_detalle.map((p) => [p.provincia, p.especies])), "especies");
  $("lead").textContent =
    "Pregunta en español, escribiendo o hablando, como le preguntarías a una persona. " +
    "Un modelo de lenguaje convierte tu pregunta en SQL y la respuesta sale de una base de datos real: " +
    `${num(datos.total_avistamientos)} avistamientos de ${nombre} hechos por ${num(datos.total_observadores)} personas en todo el país.`;
  const masDiversa = datos.provincias_detalle[0];
  $("resumen").innerHTML = [
    [num(datos.total_especies), "especies"],
    [num(datos.total_avistamientos), "avistamientos"],
    [num(datos.total_observadores), "observadores"],
    [num(masDiversa.especies), `especies en ${masDiversa.provincia}, la provincia más diversa`],
  ]
    .map(([n, t]) => `<div class="dato"><b>${escapar(n)}</b><span>${escapar(t)}</span></div>`)
    .join("");
}

// ── Respuesta ──

// La columna cuyos valores son todos provincias (o «Sin provincia»), con al
// menos una que esté en el mapa.
function columnaProvincia(filas) {
  return Object.keys(filas[0]).find(
    (c) =>
      filas.some((f) => typeof f[c] === "string" && caminoDe(f[c])) &&
      filas.every((f) => f[c] == null || (typeof f[c] === "string" && (caminoDe(f[c]) || clave(f[c]) === "sin provincia"))),
  );
}

function columnaNumero(filas, excepto) {
  return Object.keys(filas[0]).find(
    (c) => c !== excepto && !c.endsWith("_id") && !NO_CANTIDAD.has(c) && filas.every((f) => typeof f[c] === "number"),
  );
}

function frase(datos, filas, colProv, colNum) {
  if (colProv) {
    const n = new Set(filas.map((f) => f[colProv])).size;
    if (!colNum && filas.length > n) {
      return `${num(filas.length)} filas en <b>${n} provincia${n === 1 ? "" : "s"}</b>.`;
    }
    if (colNum) {
      const total = filas.reduce((s, f) => s + f[colNum], 0);
      const mayor = filas.reduce((a, b) => (b[colNum] > a[colNum] ? b : a));
      const parte = total ? Math.round((100 * mayor[colNum]) / total) : 0;
      return `${n} provincia${n === 1 ? "" : "s"} en la respuesta. La de más ${escapar(etiqueta(colNum).toLowerCase())}: <b>${escapar(mayor[colProv])}</b>, con ${num(mayor[colNum])}${n > 1 ? ` (el ${parte} %)` : ""}.`;
    }
    return `Aparece en <b>${n} provincia${n === 1 ? "" : "s"}</b>.`;
  }
  return `${num(datos.total)} resultado${datos.total === 1 ? "" : "s"}.`;
}

function tabla(filas) {
  const columnas = Object.keys(filas[0]).filter((c) => !OCULTAS.has(c));
  if (!columnas.length) return "";
  const cab = columnas.map((c) => `<th>${escapar(etiqueta(c))}</th>`).join("");
  const cuerpo = filas
    .map(
      (f) =>
        "<tr>" +
        columnas
          .map((c) => {
            const v = f[c];
            const clase = typeof v === "number" ? "num" : c === "nombre_cientifico" ? "cientifico" : "";
            return `<td class="${clase}">${v == null ? "—" : escapar(typeof v === "number" && !NO_CANTIDAD.has(c) && !c.endsWith("_id") ? num(v) : v)}</td>`;
          })
          .join("") +
        "</tr>",
    )
    .join("");
  return `<div class="tabla"><table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
}

// ── Fotos y audios ──
// Las observaciones de iNaturalist se muestran dentro de la respuesta (las 6
// primeras, con licencia CC y su crédito, vía GET /multimedia). Las demás
// fuentes, o los archivos sin licencia abierta, quedan como enlace.

const MAX_GALERIA = 6;
const esInat = (url) => /^https:\/\/(www\.)?inaturalist\.org\/observations\/\d+\/?$/.test(url ?? "");

function observaciones(filas) {
  const conEnlace = filas.filter((f) => typeof f.occurrence_url === "string" && /^https:\/\//.test(f.occurrence_url));
  const vistas = new Set();
  const unicas = conEnlace.filter((f) => !vistas.has(f.occurrence_url) && vistas.add(f.occurrence_url));
  const galeria = unicas.filter((f) => esInat(f.occurrence_url)).slice(0, MAX_GALERIA);
  const enlaces = unicas.filter((f) => !galeria.includes(f)).slice(0, 12);
  let html = "";
  if (galeria.length) {
    html +=
      '<div class="galeria">' +
      galeria.map((f) => `<figure data-url="${escapar(f.occurrence_url)}" data-especie="${escapar(f.nombre_cientifico ?? "")}"><div class="esperando"></div></figure>`).join("") +
      "</div>";
  }
  if (enlaces.length) {
    html +=
      '<div class="observaciones">' +
      enlaces
        .map((f) => {
          const sitio = new URL(f.occurrence_url).hostname.replace(/^www\./, "");
          const tipo = /Sound/.test(f.media_type ?? "") ? (/StillImage/.test(f.media_type) ? "foto y audio" : "audio") : "foto";
          return `<a href="${escapar(f.occurrence_url)}" target="_blank" rel="noopener">${escapar(tipo)} · ${escapar(sitio)} ↗</a>`;
        })
        .join("") +
      "</div>";
  }
  return html;
}

async function llenarGaleria(caja) {
  for (const figura of caja.querySelectorAll(".galeria figure")) {
    const url = figura.dataset.url;
    const enlace = `<a href="${escapar(url)}" target="_blank" rel="noopener">iNaturalist ↗</a>`;
    let m;
    try {
      const r = await fetch(`/multimedia?url=${encodeURIComponent(url)}`);
      m = r.ok ? await r.json() : null;
    } catch {
      m = null;
    }
    if (!figura.isConnected) return; // llegó otra respuesta mientras tanto
    if (!m || (!m.fotos.length && !m.sonidos.length)) {
      figura.innerHTML = `<figcaption>Sin foto ni audio con licencia abierta · ${enlace}</figcaption>`;
      continue;
    }
    let html = "";
    const foto = m.fotos[0];
    if (foto) {
      const alt = `Foto de ${figura.dataset.especie || "la observación"}, ${foto.credito}`;
      html += `<button type="button" class="miniatura" data-grande="${escapar(foto.grande)}" data-credito="${escapar(foto.credito)}"><img src="${escapar(foto.url)}" alt="${escapar(alt)}" loading="lazy"></button>`;
    }
    for (const s of m.sonidos) html += `<audio controls preload="none" src="${escapar(s.url)}"></audio>`;
    const credito = (foto ?? m.sonidos[0]).credito;
    html += `<figcaption>${escapar(credito)} · ${enlace}</figcaption>`;
    figura.innerHTML = html;
  }
}

// Visor: la foto en grande, con su crédito.
document.addEventListener("click", (ev) => {
  const boton = ev.target.closest(".miniatura");
  if (!boton) return;
  // La imagen se crea al abrir: en el HTML no queda un <img> sin src.
  const img = document.createElement("img");
  img.id = "visor-img";
  img.src = boton.dataset.grande;
  img.alt = boton.querySelector("img").alt;
  $("visor-foto").replaceChildren(img);
  $("visor-credito").textContent = boton.dataset.credito;
  $("visor").showModal();
});
$("visor").addEventListener("click", (ev) => {
  if (ev.target === $("visor")) $("visor").close(); // clic fuera de la foto
});

// "groq" -> "gpt-oss-20b (Groq)"; "groq:qwen/qwen3.8-27b" -> "qwen3.8-27b (Groq)";
// "gemini:gemini-3.5-flash-lite" -> "gemini-3.5-flash-lite (Google)".
function nombreProveedor(p) {
  if (!p) return "—";
  if (p === "groq") return "gpt-oss-20b (Groq)";
  if (p.startsWith("groq:")) return `${p.slice(5).split("/").pop()} (Groq)`;
  return p.startsWith("gemini:") ? `${p.slice(7)} (Google)` : p;
}

function comoFunciona(datos, transcripcion) {
  const t = datos.tiempos ?? {};
  const intentos = datos.intentos > 1 ? ` · ${datos.intentos} intentos` : "";
  const pregunta = transcripcion
    ? `por voz · ${escapar(transcripcion.modelo)} (Groq) la pasa a texto · ${num(transcripcion.ms)} ms`
    : "en español, texto o voz";
  return `<details>
    <summary>Ver cómo funciona</summary>
    <div class="pasos">
      <div><b>1 · pregunta</b>${pregunta}</div>
      <div><b>2 · modelo</b>${
        datos.desde_cache
          ? `${escapar(nombreProveedor(datos.proveedor_llm))} escribió este SQL para una pregunta igual · respuesta guardada, sin gastar cuota del modelo`
          : `${escapar(nombreProveedor(datos.proveedor_llm))} escribe el SQL · ${num(Math.round(t.modelo_ms ?? 0))} ms${intentos}`
      }</div>
      <div><b>3 · guardia</b>solo SELECT, usuario de solo lectura, máx. 100 filas</div>
      <div><b>4 · Postgres</b>Neon · ${num(datos.total ?? 0)} filas · ${num(Math.round(t.base_ms ?? 0))} ms</div>
    </div>
    <pre>${escapar(datos.sql_ejecutado ?? datos.sql ?? "")}</pre>
  </details>`;
}

function mostrarRespuesta(entrada) {
  const { datos, pregunta, transcripcion } = entrada;
  const caja = $("respuesta");
  caja.hidden = false;
  detenerVoz();

  if (datos.error) {
    caja.innerHTML = `<p class="error">${escapar(datos.error)}</p>${datos.sql ? comoFunciona(datos, transcripcion) : ""}`;
    return;
  }
  const filas = datos.filas ?? [];
  $("titulo-mapa").innerHTML = escapar(pregunta);
  if (!filas.length) {
    $("nota-mapa").textContent = "sin resultados";
    caja.innerHTML = `<p class="frase">La consulta no encontró nada.</p>${botonEscuchar()}${comoFunciona(datos, transcripcion)}`;
    prepararEscuchar(caja, entrada);
    return;
  }

  const colProv = columnaProvincia(filas);
  const colNum = columnaNumero(filas, colProv);
  const recortada = /\bLIMIT\s+(\d+)\s*$/i.exec(datos.sql_ejecutado ?? "");
  // Solo los cortes por defecto (10 o más): un LIMIT 1 es la respuesta, no un recorte.
  const aviso =
    recortada && Number(recortada[1]) >= 10 && filas.length === Number(recortada[1])
      ? `<p class="aviso">Se muestran las primeras ${filas.length}; puede haber más. Pide «todas» en la pregunta para ver la lista completa.</p>`
      : "";

  let cuerpo;
  const columnasVisibles = Object.keys(filas[0]).filter((c) => !OCULTAS.has(c));
  if (filas.length === 1 && columnasVisibles.length <= 2 && !colProv) {
    const valores = columnasVisibles.map((c) => filas[0][c]);
    const numero = valores.find((v) => typeof v === "number");
    const texto = valores.find((v) => typeof v === "string");
    cuerpo =
      (texto ? `<div class="grande texto">${escapar(texto)}</div>` : "") +
      (numero != null ? `<div class="grande">${num(numero)}</div>` : "") +
      `<p class="frase">${escapar(etiqueta(columnasVisibles.find((c) => typeof filas[0][c] === "number") ?? columnasVisibles[0]))}</p>`;
  } else {
    cuerpo = `<p class="frase">${frase(datos, filas, colProv, colNum)}</p>${tabla(filas)}`;
  }
  caja.innerHTML = cuerpo + aviso + botonEscuchar() + observaciones(filas) + comoFunciona(datos, transcripcion);
  prepararEscuchar(caja, entrada);
  llenarGaleria(caja);

  if (colProv) {
    if (colNum) {
      $("nota-mapa").textContent = etiqueta(colNum).toLowerCase();
      pintarMapa(new Map(filas.map((f) => [f[colProv], f[colNum]])), etiqueta(colNum).toLowerCase());
    } else if (filas.length > new Set(filas.map((f) => f[colProv])).size) {
      // Filas sueltas (avistamientos): el mapa cuenta cuántas caen en cada provincia.
      const cuenta = new Map();
      for (const f of filas) cuenta.set(f[colProv], (cuenta.get(f[colProv]) ?? 0) + 1);
      $("nota-mapa").textContent = "filas de la respuesta por provincia";
      pintarMapa(cuenta, "filas");
    } else {
      $("nota-mapa").textContent = "provincias con resultados";
      pintarMapa(new Map(filas.map((f) => [f[colProv], null])), "");
    }
  } else {
    // La respuesta no habla de provincias: el mapa vuelve al panorama.
    $("nota-mapa").textContent = "el mapa muestra las especies por provincia";
    const p = estado.panorama[entrada.coleccion];
    if (p) pintarMapa(new Map(p.provincias_detalle.map((x) => [x.provincia, x.especies])), "especies");
  }
}

// ── Preguntar ──

const MENSAJE_RED = "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.";

// extra: { porVoz, transcripcion } cuando la pregunta llegó hablando.
async function preguntar(pregunta, extra = {}) {
  pregunta = pregunta.trim();
  if (!pregunta) return;
  const boton = $("preguntar");
  boton.disabled = true;
  $("respuesta").hidden = false;
  $("respuesta").innerHTML = '<p class="cargando">Escribiendo el SQL y consultando la base…</p>';
  // Primero se pinta el «cargando» (el clic responde ya, INP) y después se
  // desplaza la página, que es lo que cuesta. Con la pestaña en segundo plano
  // no hay cuadros: el tope de 100 ms evita que la pregunta se quede parada.
  await new Promise((r) => {
    requestAnimationFrame(() => setTimeout(r, 0));
    setTimeout(r, 100);
  });
  $("respuesta").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });

  let datos;
  try {
    const r = await fetch("/consultar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta, coleccion: COLECCIONES[estado.coleccion].api }),
    });
    datos = await r.json().catch(() => ({ error: `El servidor respondió ${r.status}.` }));
  } catch {
    datos = { error: MENSAJE_RED };
  } finally {
    boton.disabled = false;
  }
  const entrada = { pregunta, coleccion: estado.coleccion, datos, ...extra };
  if (!datos.error || datos.sql) {
    estado.historial.unshift(entrada);
    estado.historial = estado.historial.slice(0, 8);
  }
  estado.actual = entrada;
  mostrarRespuesta(entrada);
  pintarHistorial();
  // Toda respuesta se oye sola (pedido de David, como la app entregada con
  // las preguntas habladas). Si el navegador lo bloquea, queda «Escuchar».
  if (!datos.error) escuchar(entrada);
}

function pintarHistorial() {
  const lista = $("lista-anteriores");
  $("anteriores").hidden = estado.historial.length < 2;
  lista.innerHTML = "";
  estado.historial.forEach((e) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${e.pregunta} · ${COLECCIONES[e.coleccion].nombre}`;
    b.setAttribute("aria-current", String(e === estado.actual));
    b.addEventListener("click", async () => {
      if (e.coleccion !== estado.coleccion) await cambiarColeccion(e.coleccion, false);
      estado.actual = e;
      mostrarRespuesta(e);
      pintarHistorial();
    });
    li.appendChild(b);
    lista.appendChild(li);
  });
}

// ── Colección ──

function pintarSugeridas() {
  const caja = $("sugeridas");
  caja.innerHTML = "";
  for (const s of COLECCIONES[estado.coleccion].sugeridas) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s;
    b.addEventListener("click", () => {
      desbloquearAudio();
      $("pregunta").value = s;
      preguntar(s);
    });
    caja.appendChild(b);
  }
}

async function cambiarColeccion(coleccion, limpiar = true) {
  estado.coleccion = coleccion;
  document.documentElement.dataset.coleccion = coleccion;
  document.querySelectorAll(".pestanas button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.coleccion === coleccion)));
  pintarSugeridas();
  if (limpiar) {
    $("respuesta").hidden = true;
    estado.actual = null;
    pintarHistorial();
  }
  try {
    mostrarPanorama(await cargarPanorama(coleccion));
  } catch {
    $("nota-mapa").textContent = "no se pudo cargar el panorama";
  }
}

// ── Voz (fase 4) ──
// Entrada: se graba en el navegador y el Worker la pasa a texto con Whisper
// (POST /transcribir). Si el navegador no puede grabar, o la transcripción
// falla, queda el dictado del navegador (Web Speech API).
// Salida: «Escuchar» pide el MP3 con la voz de Roberto, es-PA-RobertoNeural
// (POST /hablar). Si el servicio de Microsoft falla, habla la voz del
// propio navegador.

const MAX_GRABACION_MS = 30_000;
const MIN_GRABACION_MS = 700; // menos que esto es un toque sin querer
const MAX_VALOR_HABLADO = 80; // como textoHablado en nube/worker/src/voz.ts
const ESTADO_CAJA = "texto o voz · en español";
const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
const puedeGrabar = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
let modoVoz = puedeGrabar ? "grabar" : Reconocimiento ? "dictado" : null;

const avisoCaja = (texto) => ($("estado-caja").textContent = texto);

function botonHablar(grabando) {
  const b = $("hablar");
  b.classList.toggle("grabando", grabando);
  b.textContent = grabando ? "■ Detener" : "● Hablar";
}

function prepararVoz() {
  if (!modoVoz) return; // el botón queda oculto
  const boton = $("hablar");
  boton.hidden = false;
  boton.addEventListener("click", () => {
    desbloquearAudio();
    if (modoVoz === "grabar") alternarGrabacion();
    else alternarDictado();
  });
}

// Un formato que el navegador sepa grabar y Whisper sepa leer.
function formatoDeGrabacion() {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}

let grabadora = null;

async function alternarGrabacion() {
  if (grabadora) {
    grabadora.stop();
    return;
  }
  let flujo;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    avisoCaja(e.name === "NotAllowedError" ? "permite el micrófono para hablar" : "no se encontró un micrófono");
    return;
  }
  const tipo = formatoDeGrabacion();
  const rec = tipo ? new MediaRecorder(flujo, { mimeType: tipo }) : new MediaRecorder(flujo);
  const trozos = [];
  rec.ondataavailable = (ev) => ev.data.size && trozos.push(ev.data);
  const tope = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_GRABACION_MS);
  let inicio = 0;
  rec.onstart = () => (inicio = performance.now());
  rec.onstop = () => {
    clearTimeout(tope);
    flujo.getTracks().forEach((t) => t.stop());
    grabadora = null;
    botonHablar(false);
    const audio = new Blob(trozos, { type: rec.mimeType || tipo || "audio/webm" });
    if (!audio.size || performance.now() - inicio < MIN_GRABACION_MS) avisoCaja("no se oyó nada, intenta de nuevo");
    else enviarGrabacion(audio);
  };
  grabadora = rec;
  rec.start(1000); // un trozo por segundo: si el flujo se corta, no se pierde todo
  botonHablar(true);
  avisoCaja("grabando… toca Detener al terminar");
}

async function enviarGrabacion(audio) {
  const boton = $("hablar");
  boton.disabled = true;
  avisoCaja("pasando tu voz a texto…");
  let r = null;
  let datos = null;
  try {
    r = await fetch("/transcribir", { method: "POST", headers: { "Content-Type": audio.type }, body: audio });
    datos = await r.json().catch(() => null);
  } catch {}
  boton.disabled = false;
  if (r?.ok && datos) {
    if (!datos.texto) {
      avisoCaja("no se entendió, intenta de nuevo");
      return;
    }
    avisoCaja(ESTADO_CAJA);
    $("pregunta").value = datos.texto;
    preguntar(datos.texto, { porVoz: true, transcripcion: { modelo: datos.modelo, ms: datos.ms } });
    return;
  }
  if (r?.status === 429 && datos?.error) {
    avisoCaja(datos.error);
    return;
  }
  // Falló la transcripción: queda el dictado del navegador, si lo tiene.
  if (Reconocimiento) {
    modoVoz = "dictado";
    avisoCaja("no se pudo transcribir; toca Hablar para usar el dictado del navegador");
  } else {
    avisoCaja("no se pudo transcribir; escribe tu pregunta");
  }
}

let dictado = null;

function alternarDictado() {
  if (dictado) {
    dictado.stop();
    return;
  }
  dictado = new Reconocimiento();
  dictado.lang = "es-PA";
  dictado.interimResults = true;
  let final = "";
  dictado.onresult = (ev) => {
    final = [...ev.results].map((r) => r[0].transcript).join(" ");
    $("pregunta").value = final;
  };
  dictado.onend = () => {
    botonHablar(false);
    avisoCaja(ESTADO_CAJA);
    dictado = null;
    if (final.trim()) preguntar(final, { porVoz: true });
  };
  dictado.onerror = (ev) => {
    avisoCaja(ev.error === "not-allowed" ? "permite el micrófono para hablar" : "no se entendió, intenta de nuevo");
  };
  botonHablar(true);
  avisoCaja("escuchando…");
  dictado.start();
}

// Lo que se dice en voz alta, como formatear_respuesta_hablada de app/app_flask.py.
function textoHablado(filas) {
  if (!filas.length) return "No se encontraron resultados para tu pregunta.";
  if (filas.length === 1) {
    const valores = Object.entries(filas[0])
      .filter(([c, v]) => !OCULTAS.has(c) && v != null)
      .map(([, v]) => v);
    const legibles = valores.every((v) => ["string", "number", "boolean"].includes(typeof v) && String(v).length <= MAX_VALOR_HABLADO);
    if (valores.length > 0 && valores.length <= 4 && legibles) return `El resultado es: ${valores.map(String).join(", ")}.`;
    return "Se encontró 1 resultado. Revisa la pantalla para el detalle completo.";
  }
  return `Se encontraron ${filas.length} resultados. Revisa la tabla en pantalla para el detalle completo.`;
}

const botonEscuchar = () => '<p class="escuchar"><button class="btn" type="button" data-escuchar>▶ Escuchar</button></p>';

function prepararEscuchar(caja, entrada) {
  caja.querySelector("[data-escuchar]")?.addEventListener("click", () => (sonando === entrada ? detenerVoz() : escuchar(entrada)));
}

const reproductor = new Audio();

// La respuesta llega segundos después del clic, y los navegadores (Safari y
// Chrome en el teléfono, sobre todo) solo dejan sonar audio iniciado por un
// toque. Por eso, en el mismo toque que pregunta, este reproductor suena un
// silencio de 50 ms y la voz del navegador dice una frase vacía: los dos
// quedan habilitados para cuando llegue la respuesta. Lo mismo hacía
// desbloquearAudio() en la app entregada.
let audioDesbloqueado = false;
function desbloquearAudio() {
  if (audioDesbloqueado) return;
  audioDesbloqueado = true;
  const muestras = 1200; // 50 ms a 24 kHz
  const wav = new DataView(new ArrayBuffer(44 + muestras * 2));
  const texto = (o, t) => [...t].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
  texto(0, "RIFF");
  wav.setUint32(4, 36 + muestras * 2, true);
  texto(8, "WAVEfmt ");
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true); // PCM
  wav.setUint16(22, 1, true); // mono
  wav.setUint32(24, 24000, true);
  wav.setUint32(28, 48000, true);
  wav.setUint16(32, 2, true);
  wav.setUint16(34, 16, true);
  texto(36, "data");
  wav.setUint32(40, muestras * 2, true);
  reproductor.src = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  reproductor.play().catch(() => (audioDesbloqueado = false));
  try {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
  } catch {}
}
let sonando = null; // la respuesta que se está oyendo

function estadoEscuchar(texto, ocupado = false) {
  const b = $("respuesta").querySelector("[data-escuchar]");
  if (!b) return;
  b.textContent = texto;
  b.disabled = ocupado;
}

function detenerVoz() {
  reproductor.pause();
  window.speechSynthesis?.cancel();
  if (sonando) {
    sonando = null;
    estadoEscuchar("▶ Escuchar");
  }
}

async function escuchar(entrada) {
  detenerVoz();
  sonando = entrada;
  const filas = entrada.datos.filas ?? [];
  const texto = textoHablado(filas); // la misma frase, para la voz del navegador si /hablar falla
  if (!entrada.audio) {
    estadoEscuchar("Preparando la voz…", true);
    try {
      const r = await fetch("/hablar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // El Worker arma la frase con esto (no acepta texto libre).
        body: JSON.stringify({ total: filas.length, fila: filas.length === 1 ? filas[0] : undefined }),
      });
      if (r.ok && r.headers.get("content-type")?.startsWith("audio/")) entrada.audio = URL.createObjectURL(await r.blob());
    } catch {}
    if (sonando !== entrada) return; // la detuviste o llegó otra respuesta
  }
  estadoEscuchar("■ Detener");
  const terminar = () => {
    if (sonando !== entrada) return;
    sonando = null;
    estadoEscuchar("▶ Escuchar");
  };
  if (entrada.audio) {
    reproductor.src = entrada.audio;
    reproductor.onended = terminar;
    try {
      await reproductor.play();
      return;
    } catch (e) {
      // El navegador no deja sonar sin un toque: queda el botón.
      if (e.name === "NotAllowedError") return terminar();
    }
  }
  // Respaldo: la voz del navegador, con el mismo texto.
  if (!window.speechSynthesis) return terminar();
  const dicho = new SpeechSynthesisUtterance(texto);
  dicho.lang = "es-PA";
  const voces = speechSynthesis.getVoices();
  dicho.voice = voces.find((v) => v.lang === "es-PA") ?? voces.find((v) => v.lang?.startsWith("es")) ?? null;
  dicho.onend = terminar;
  dicho.onerror = terminar;
  speechSynthesis.speak(dicho);
}

// ── Inicio ──

document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => cambiarColeccion(b.dataset.coleccion)));
$("formulario").addEventListener("submit", (ev) => {
  ev.preventDefault();
  desbloquearAudio();
  preguntar($("pregunta").value);
});
$("pregunta").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    desbloquearAudio();
    preguntar($("pregunta").value);
  }
});

// Tema: claro, oscuro o como el sistema (tema.js ya lo aplicó al cargar).
function aplicarTema(tema) {
  if (tema === "claro" || tema === "oscuro") document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
  document.querySelectorAll(".tema button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tema === tema)));
}
let temaGuardado = "sistema";
try {
  temaGuardado = localStorage.getItem("tema") || "sistema";
} catch {}
aplicarTema(new URLSearchParams(location.search).get("tema")?.match(/^(claro|oscuro)$/)?.[0] ?? temaGuardado);
document.querySelectorAll(".tema button").forEach((b) =>
  b.addEventListener("click", () => {
    aplicarTema(b.dataset.tema);
    try {
      localStorage.setItem("tema", b.dataset.tema);
    } catch {}
  }),
);

// Mascotas: un clic y saltan.
for (const id of ["rana", "ave"]) {
  const m = $(id);
  m.addEventListener("click", () => {
    m.classList.remove("salta");
    void m.offsetWidth; // reinicia la animación si ya estaba saltando
    m.classList.add("salta");
  });
  m.addEventListener("animationend", (ev) => {
    if (ev.animationName === "salto-rana" || ev.animationName === "vuelo-corto") m.classList.remove("salta");
  });
}

prepararVoz();
cargarPanorama("anfibios").catch(() => {}); // en paralelo con el mapa
await cargarMapa();
await cambiarColeccion("anfibios");
