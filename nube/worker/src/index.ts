// ============================================================
// API de biodiversidad en Cloudflare Workers + Hono.
// Port de app/app_flask.py, con la voz desde la fase 4:
//   GET  /estado       servidor vivo y colecciones
//   GET  /explorar     panorama de una colección, SQL fijo, sin modelo
//   POST /consultar    pregunta en español -> SQL -> filas
//   POST /transcribir  audio grabado -> texto (Groq Whisper)
//   POST /hablar       texto -> MP3 con la voz es-PA-RobertoNeural
// Las respuestas tienen la misma forma que las de Flask, para que el
// frontend pueda pasar de una a otra.
// ============================================================
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { resolverColeccion, type Coleccion } from "./colecciones";
import { consultar, type Fila } from "./db";
import { clavePersona, LimiteDeConsultas, type Veredicto } from "./limite";
import { generarSqlCascada, type EnvLlm } from "./llm";
import { idDeObservacion, multimediaDe } from "./multimedia";
import { construirPrompt } from "./prompt";
import { audioDe, CuotaAgotada, extensionDe, MAX_AUDIO_BYTES, MODELO_TRANSCRIPCION, textoHablado, transcribir, VOZ } from "./voz";
import { adaptarDialecto, asegurarColumnasMultimedia, calificarTablas, esSqlSeguro, limitarFilas } from "./sql";

export { LimiteDeConsultas };

interface Env extends EnvLlm {
  DATABASE_URL: string;
  LIMITE: DurableObjectNamespace<LimiteDeConsultas>;
  ORIGENES: string;
  LIMITE_POR_MINUTO: string;
  LIMITE_POR_DIA: string;
  LIMITE_GLOBAL_POR_DIA: string;
  CACHE_RESPUESTAS_DIAS: string; // 0 la apaga (para validar modelos)
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", secureHeaders({ xFrameOptions: "DENY" }));
app.use("*", (c, next) =>
  cors({ origin: c.env.ORIGENES.split(",").map((o) => o.trim()), allowMethods: ["GET", "POST"] })(c, next),
);

// ── Solo la página puede llamar a la API desde un navegador ──
// Sin esto, otra web podía mandar POST «simples» (text/plain, sin preflight
// de CORS) que gastaban el cupo de cada visitante y el global. Los clientes
// sin navegador (curl) no mandan Origin y siguen teniendo el límite por persona.

app.use("*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const origen = c.req.header("origin");
  const permitidos = c.env.ORIGENES.split(",").map((o) => o.trim());
  if (c.req.header("sec-fetch-site") === "cross-site" || (origen && !permitidos.includes(origen))) {
    return c.json({ error: "Origen no permitido" }, 403);
  }
  return next();
});

// Cuerpos máximos, revisados antes de leerlos (Cloudflare acepta hasta 100 MB).
const MAX_JSON_BYTES = 16 * 1024;

function cuerpoDemasiadoGrande(largo: string | undefined, maximo: number): boolean {
  return largo !== undefined && !(Number(largo) <= maximo);
}

async function leerJson(c: Context<{ Bindings: Env }>): Promise<Record<string, unknown> | Response> {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return c.json({ error: "Se espera application/json" }, 415);
  }
  if (cuerpoDemasiadoGrande(c.req.header("content-length"), MAX_JSON_BYTES)) {
    return c.json({ error: "La petición es demasiado grande" }, 413);
  }
  const texto = await c.req.text();
  if (texto.length > MAX_JSON_BYTES) return c.json({ error: "La petición es demasiado grande" }, 413);
  try {
    const datos = JSON.parse(texto);
    return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : {};
  } catch {
    return {};
  }
}

// ── Límite de consultas ──

const persona = (c: Context<{ Bindings: Env }>) => clavePersona(c.req.header("cf-connecting-ip"));

// Límite por persona y, si pasa, el tope diario de todo el sistema para esa ruta.
async function limitar(
  env: Env,
  ruta: string,
  quien: string,
  porMinuto: number,
  porDia: number,
  globalPorDia: number,
): Promise<Veredicto> {
  const propio = await env.LIMITE.getByName(`${ruta}:${quien}`).consumir(porMinuto, porDia);
  if (!propio.permitido) return propio;
  const global = await env.LIMITE.getByName(`${ruta}:global`).consumir(0, globalPorDia);
  return global.permitido ? global : { permitido: false, motivo: "global" };
}

function rechazar(c: Context<{ Bindings: Env }>, limite: Veredicto) {
  if (limite.reintentarEnSegundos) c.header("Retry-After", String(limite.reintentarEnSegundos));
  return c.json({ error: MENSAJES_LIMITE[limite.motivo ?? "minuto"] }, 429);
}

const MENSAJES_LIMITE: Record<string, string> = {
  minuto: "Demasiadas consultas. Espera un momento.",
  dia: "Llegaste al límite de consultas de hoy. Vuelve mañana.",
  global: "El sistema llegó a su límite de consultas de hoy. Vuelve mañana.",
};

// ── Guarda de colección (7b de app_flask.py) ──

const PALABRAS_AVES = [/\bave\b/, /\baves\b/, /\bp[áa]jaro\b/, /\bp[áa]jaros\b/];
const PALABRAS_ANFIBIOS = [
  /\banfibio\b/, /\banfibios\b/, /\brana\b/, /\branas\b/,
  /\bsapo\b/, /\bsapos\b/, /\bsalamandra\b/, /\bsalamandras\b/,
];

function detectarConflictoColeccion(pregunta: string, coleccion: Coleccion): string | null {
  const texto = pregunta.toLowerCase();
  const [patrones, mencionada, actual] =
    coleccion === "anfibios"
      ? [PALABRAS_AVES, "Aves", "Amphibia (anfibios)"]
      : [PALABRAS_ANFIBIOS, "Amphibia (anfibios)", "Aves"];
  if (patrones.some((p) => p.test(texto))) {
    return (
      `Tu pregunta menciona ${mencionada}, pero la colección activa ` +
      `es ${actual}. Cambia el selector 🐸/🦅 en la parte superior ` +
      `y vuelve a preguntar.`
    );
  }
  return null;
}

// ── Ejecutar SQL del modelo (6 y 9b de app_flask.py) ──

// `error` es lo que ve la persona; `detalle`, el error exacto que se le
// devuelve al modelo para que se corrija (no se muestra: delataba nombres
// internos y permitía sacar datos por los mensajes de error).
type ResultadoSql = { filas: Fila[]; total: number; sql_ejecutado: string } | { error: string; detalle: string };

const ERROR_CONSULTA = "No se pudo responder esa pregunta. Prueba a hacerla de otra forma.";
const MAX_RESPUESTA_BYTES = 1_000_000;

async function ejecutarSql(env: Env, esquema: Coleccion, sql: string): Promise<ResultadoSql> {
  const [ok, motivo] = esSqlSeguro(sql);
  if (!ok) {
    console.warn(`SQL rechazado: ${motivo} | SQL: ${sql.slice(0, 150)}`);
    return { error: ERROR_CONSULTA, detalle: `Consulta no permitida: ${motivo}` };
  }
  const sqlFinal = limitarFilas(sql);
  try {
    const filas = await consultar(env.DATABASE_URL, esquema, sqlFinal);
    if (JSON.stringify(filas).length > MAX_RESPUESTA_BYTES) {
      console.warn(`Respuesta demasiado grande | SQL: ${sqlFinal.slice(0, 150)}`);
      return { error: ERROR_CONSULTA, detalle: "El resultado pesa más de 1 MB: devuelve menos columnas o agrupa." };
    }
    return { filas, total: filas.length, sql_ejecutado: sqlFinal };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`Error Postgres: ${mensaje} | SQL: ${sqlFinal.slice(0, 150)}`);
    return { error: ERROR_CONSULTA, detalle: `Error de base de datos: ${mensaje}` };
  }
}

function prepararSql(sql: string, esquema: Coleccion): string {
  return calificarTablas(asegurarColumnasMultimedia(adaptarDialecto(sql)), esquema);
}

// Si Postgres rechaza el SQL, se le devuelve el error exacto al modelo
// para que se corrija; hasta 3 intentos, como en la app de Flask.
async function generarYEjecutar(env: Env, pregunta: string, esquema: Coleccion, maxIntentos = 3) {
  const prompt = construirPrompt(esquema);
  // Tiempos reales para «Ver cómo funciona» en la página.
  const tiempos = { modelo_ms: 0, base_ms: 0 };
  const medir = async <T>(clave: keyof typeof tiempos, f: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await f();
    } finally {
      tiempos[clave] += Date.now() - t0;
    }
  };

  let llm = await medir("modelo_ms", () => generarSqlCascada(env, pregunta, prompt));
  if ("error" in llm) return { llm, sql: null, resultado: null, intentos: 1, tiempos };

  let sql = prepararSql(llm.sql, esquema);
  let resultado = await medir("base_ms", () => ejecutarSql(env, esquema, sql));
  let intento = 1;
  while ("error" in resultado && intento < maxIntentos) {
    intento += 1;
    console.warn(`SQL falló, reintentando con el error: ${resultado.detalle}`);
    const correccion =
      `Tu consulta SQL anterior para la pregunta "${pregunta}" falló con este ` +
      `error real de PostgreSQL:\n${resultado.detalle}\n\n` +
      `SQL que falló:\n${sql}\n\n` +
      `Corrige el SQL para que funcione, respetando el esquema y las reglas ` +
      `del sistema. Responde ÚNICAMENTE con el SQL corregido.`;
    const reintento = await medir("modelo_ms", () => generarSqlCascada(env, correccion, prompt));
    if ("error" in reintento) break;
    llm = reintento;
    sql = prepararSql(reintento.sql, esquema);
    resultado = await medir("base_ms", () => ejecutarSql(env, esquema, sql));
  }
  return { llm, sql, resultado, intentos: intento, tiempos };
}

// ── Respuestas guardadas ──
// Una pregunta igual (sin mayúsculas, acentos ni signos) en la misma
// colección devuelve la respuesta guardada: no llama al modelo ni gasta el
// cupo de la persona. Las sugeridas de la portada son las que más se repiten.
// Los datos no cambian, así que la respuesta guardada sigue siendo correcta.

function normalizarPregunta(pregunta: string): string {
  return pregunta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function claveRespuesta(esquema: Coleccion, pregunta: string): Promise<Request> {
  const resumen = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${esquema}|${normalizarPregunta(pregunta)}`));
  const hexa = [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`https://cache.interna/respuestas/v1/${hexa}`);
}

// ── Rutas ──

app.get("/estado", (c) =>
  c.json({
    servidor: "activo",
    llm_provider_preferido: "groq",
    bases_disponibles: ["amphibia", "aves"],
    hora: new Date().toISOString(),
  }),
);

app.get("/explorar", async (c) => {
  const esquema = resolverColeccion(c.req.query("coleccion"));
  if (!esquema) return c.json({ error: "Colección inválida. Usa 'amphibia' o 'aves'" }, 400);
  const q = (sql: string) => consultar(c.env.DATABASE_URL, esquema, sql);
  try {
    const [especies, avistamientos, observadores, provincias, rango, familias, nombresProvincias, especiesTop, detalle] =
      await Promise.all([
        q("SELECT COUNT(*) AS n FROM especie"),
        q("SELECT COUNT(*) AS n FROM avistamiento"),
        q("SELECT COUNT(*) AS n FROM observador"),
        q("SELECT COUNT(*) AS n FROM provincia"),
        q("SELECT MIN(anio) AS min_anio, MAX(anio) AS max_anio FROM avistamiento"),
        q(`SELECT f.nombre AS familia, COUNT(e.especie_id) AS especies
           FROM familia f JOIN especie e ON f.familia_id = e.familia_id
           GROUP BY f.nombre ORDER BY especies DESC LIMIT 10`),
        q("SELECT nombre FROM provincia ORDER BY nombre"),
        q(`SELECT e.nombre_cientifico, e.nombre_comun, COUNT(*) AS total
           FROM avistamiento a JOIN especie e ON a.especie_id = e.especie_id
           GROUP BY e.nombre_cientifico, e.nombre_comun
           ORDER BY total DESC LIMIT 8`),
        // Para pintar el mapa sin gastar cuota del modelo.
        q(`SELECT provincia, COUNT(DISTINCT especie_id) AS especies, COUNT(*) AS avistamientos
           FROM vista_avistamiento_completo GROUP BY provincia ORDER BY especies DESC`),
      ]);
    return c.json({
      coleccion: esquema === "anfibios" ? "amphibia" : "aves",
      total_especies: especies[0].n,
      total_avistamientos: avistamientos[0].n,
      total_observadores: observadores[0].n,
      total_provincias: provincias[0].n,
      rango_anios: `${rango[0].min_anio}–${rango[0].max_anio}`,
      familias_top: familias,
      provincias: nombresProvincias.map((r) => r.nombre),
      especies_top: especiesTop,
      provincias_detalle: detalle,
    });
  } catch (e) {
    console.error(`Error en /explorar: ${e}`);
    return c.json({ error: "Error de base de datos" }, 500);
  }
});

app.post("/consultar", async (c) => {
  const datos = await leerJson(c);
  if (datos instanceof Response) return datos;
  const pregunta = typeof datos.pregunta === "string" ? datos.pregunta.trim() : "";
  const esquema = resolverColeccion(datos.coleccion);

  if (!pregunta) return c.json({ error: "Falta el campo 'pregunta'" }, 400);
  if (pregunta.length > 500) return c.json({ error: "La pregunta es demasiado larga" }, 400);
  if (!esquema) return c.json({ error: "Colección inválida. Usa 'amphibia' o 'aves'" }, 400);

  const conflicto = detectarConflictoColeccion(pregunta, esquema);
  if (conflicto) return c.json({ error: conflicto }, 400);

  const diasCache = Number(c.env.CACHE_RESPUESTAS_DIAS ?? "0");
  const clave = diasCache > 0 ? await claveRespuesta(esquema, pregunta) : null;
  const guardada = clave ? await caches.default.match(clave) : undefined;
  if (guardada) {
    const datosGuardados = (await guardada.json()) as Record<string, unknown>;
    console.log(`PREGUNTA (guardada): ${pregunta.slice(0, 80)} | COLECCION: ${esquema}`);
    return c.json({ ...datosGuardados, pregunta, desde_cache: true });
  }

  // Se cuenta después de las validaciones baratas: una pregunta vacía no gasta cupo.
  const limite = await limitar(
    c.env,
    "persona",
    persona(c),
    Number(c.env.LIMITE_POR_MINUTO),
    Number(c.env.LIMITE_POR_DIA),
    Number(c.env.LIMITE_GLOBAL_POR_DIA),
  );
  if (!limite.permitido) return rechazar(c, limite);

  const { llm, sql, resultado, intentos, tiempos } = await generarYEjecutar(c.env, pregunta, esquema);
  if (!resultado) {
    if ("ocupado" in llm && llm.ocupado) {
      c.header("Retry-After", "60");
      return c.json({ error: llm.error }, 503);
    }
    return c.json(llm, 502);
  }

  const proveedor = "proveedor" in llm ? llm.proveedor : null;
  console.log(`PREGUNTA: ${pregunta.slice(0, 80)} | COLECCION: ${esquema} | PROVEEDOR: ${proveedor} | INTENTOS: ${intentos}`);
  const respuesta = {
    pregunta,
    coleccion: esquema === "anfibios" ? "amphibia" : "aves",
    sql,
    proveedor_llm: proveedor,
    intentos,
    tiempos,
    ...("error" in resultado ? { error: resultado.error } : resultado),
  };
  // Solo se guardan las que salieron bien.
  if (clave && !("error" in resultado)) {
    const guardar = new Response(JSON.stringify(respuesta), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${diasCache * 86_400}` },
    });
    c.executionCtx.waitUntil(caches.default.put(clave, guardar));
  }
  return c.json(respuesta);
});

// Fotos y audios con licencia CC de una observación de iNaturalist (ver multimedia.ts).
app.get("/multimedia", async (c) => {
  const id = idDeObservacion(c.req.query("url"));
  if (!id) return c.json({ error: "Solo se aceptan observaciones de iNaturalist" }, 400);
  const limite = await limitar(c.env, "multimedia", persona(c), 60, 600, 20_000);
  if (!limite.permitido) return rechazar(c, limite);
  try {
    return c.json(await multimediaDe(id, c.executionCtx));
  } catch (e) {
    console.warn(`Multimedia ${id}: ${e}`);
    return c.json({ error: "No se pudo traer la multimedia de iNaturalist" }, 502);
  }
});

// ── Voz (fase 4, ver voz.ts) ──

// Cada transcripción va seguida de una consulta, que ya tiene su límite; este
// cuida la cuota de Whisper en Groq (2.000 audios al día en el plan gratis).
app.post("/transcribir", async (c) => {
  const extension = extensionDe(c.req.header("content-type"));
  if (!extension) return c.json({ error: "Formato de audio no admitido" }, 415);
  if (cuerpoDemasiadoGrande(c.req.header("content-length"), MAX_AUDIO_BYTES)) {
    return c.json({ error: "La grabación es demasiado larga" }, 413);
  }
  const audio = await c.req.arrayBuffer();
  if (!audio.byteLength) return c.json({ error: "Falta el audio" }, 400);
  if (audio.byteLength > MAX_AUDIO_BYTES) return c.json({ error: "La grabación es demasiado larga" }, 413);

  const limite = await limitar(c.env, "transcribir", persona(c), 10, 100, 1500);
  if (!limite.permitido) return rechazar(c, limite);

  const t0 = Date.now();
  try {
    const texto = await transcribir(c.env.GROQ_API_KEY, audio, extension);
    console.log(`TRANSCRIBIR: ${audio.byteLength} bytes ${extension} | ${Date.now() - t0} ms | ${texto.length} caracteres`);
    return c.json({ texto, modelo: MODELO_TRANSCRIPCION, ms: Date.now() - t0 });
  } catch (e) {
    console.error(`Error en /transcribir: ${e}`);
    if (e instanceof CuotaAgotada) {
      c.header("Retry-After", "60");
      return c.json({ error: "La transcripción está ocupada. Intenta de nuevo en un minuto." }, 503);
    }
    return c.json({ error: "No se pudo transcribir el audio" }, 502);
  }
});

// Recibe cuántas filas trajo la respuesta (y la fila, si es una sola) y
// arma aquí la frase, como /hablar en Flask: no lee cualquier texto, así que
// no sirve de lector de voz gratis. Devuelve el MP3; si Microsoft no
// responde, 503 y la página usa la voz del navegador.
app.post("/hablar", async (c) => {
  const datos = await leerJson(c);
  if (datos instanceof Response) return datos;
  const texto = textoHablado(datos.total, datos.fila);
  if (!texto) return c.json({ error: "Se espera {total, fila}" }, 400);

  const limite = await limitar(c.env, "hablar", persona(c), 20, 200, 3000);
  if (!limite.permitido) return rechazar(c, limite);

  const t0 = Date.now();
  try {
    const { audio, deCache } = await audioDe(texto, c.executionCtx);
    console.log(`HABLAR: ${texto.length} caracteres | ${deCache ? "caché" : "Microsoft"} | ${Date.now() - t0} ms`);
    return c.body(audio, 200, {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=86400",
      "X-Voz": VOZ,
      "X-Voz-Cache": deCache ? "hit" : "miss",
    });
  } catch (e) {
    console.error(`Error en /hablar: ${e}`);
    return c.json({ error: "El servicio de voz no respondió" }, 503);
  }
});

app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));
app.onError((e, c) => {
  console.error(`Error no controlado: ${e}`);
  return c.json({ error: "Error interno" }, 500);
});

export default app;
