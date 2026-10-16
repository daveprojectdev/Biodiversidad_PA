// ============================================================
// API de biodiversidad en Cloudflare Workers + Hono.
// Port de app/app_flask.py sin la voz (eso es la fase 4):
//   GET  /estado     servidor vivo y colecciones
//   GET  /explorar   panorama de una colección, SQL fijo, sin modelo
//   POST /consultar  pregunta en español -> SQL -> filas
// Las respuestas tienen la misma forma que las de Flask, para que el
// frontend pueda pasar de una a otra.
// ============================================================
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { resolverColeccion, type Coleccion } from "./colecciones";
import { consultar, type Fila } from "./db";
import { LimiteDeConsultas, type Veredicto } from "./limite";
import { generarSqlCascada, type EnvLlm } from "./llm";
import { idDeObservacion, multimediaDe } from "./multimedia";
import { construirPrompt } from "./prompt";
import { adaptarDialecto, asegurarColumnasMultimedia, calificarTablas, esSqlSeguro, limitarFilas } from "./sql";

export { LimiteDeConsultas };

interface Env extends EnvLlm {
  DATABASE_URL: string;
  LIMITE: DurableObjectNamespace<LimiteDeConsultas>;
  ORIGENES: string;
  LIMITE_POR_MINUTO: string;
  LIMITE_POR_DIA: string;
  LIMITE_GLOBAL_POR_DIA: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", secureHeaders({ xFrameOptions: "DENY" }));
app.use("*", (c, next) =>
  cors({ origin: c.env.ORIGENES.split(",").map((o) => o.trim()), allowMethods: ["GET", "POST"] })(c, next),
);

// ── Límite de consultas ──

async function revisarLimite(env: Env, persona: string): Promise<Veredicto> {
  const propio = await env.LIMITE.getByName(`persona:${persona}`).consumir(
    Number(env.LIMITE_POR_MINUTO),
    Number(env.LIMITE_POR_DIA),
  );
  if (!propio.permitido) return propio;
  const global = await env.LIMITE.getByName("global").consumir(0, Number(env.LIMITE_GLOBAL_POR_DIA));
  return global.permitido ? global : { permitido: false, motivo: "global" };
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

type ResultadoSql = { filas: Fila[]; total: number; sql_ejecutado: string } | { error: string };

async function ejecutarSql(env: Env, esquema: Coleccion, sql: string): Promise<ResultadoSql> {
  const [ok, motivo] = esSqlSeguro(sql);
  if (!ok) {
    console.warn(`SQL rechazado: ${motivo} | SQL: ${sql.slice(0, 150)}`);
    return { error: `Consulta no permitida: ${motivo}` };
  }
  const sqlFinal = limitarFilas(sql);
  try {
    const filas = await consultar(env.DATABASE_URL, esquema, sqlFinal);
    return { filas, total: filas.length, sql_ejecutado: sqlFinal };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`Error Postgres: ${mensaje} | SQL: ${sqlFinal.slice(0, 150)}`);
    return { error: `Error de base de datos: ${mensaje}` };
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
    console.warn(`SQL falló, reintentando con el error: ${resultado.error}`);
    const correccion =
      `Tu consulta SQL anterior para la pregunta "${pregunta}" falló con este ` +
      `error real de PostgreSQL:\n${resultado.error}\n\n` +
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
  const datos = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const pregunta = typeof datos.pregunta === "string" ? datos.pregunta.trim() : "";
  const esquema = resolverColeccion(datos.coleccion);

  if (!pregunta) return c.json({ error: "Falta el campo 'pregunta'" }, 400);
  if (pregunta.length > 500) return c.json({ error: "La pregunta es demasiado larga" }, 400);
  if (!esquema) return c.json({ error: "Colección inválida. Usa 'amphibia' o 'aves'" }, 400);

  const conflicto = detectarConflictoColeccion(pregunta, esquema);
  if (conflicto) return c.json({ error: conflicto }, 400);

  // Se cuenta después de las validaciones baratas: una pregunta vacía no gasta cupo.
  const persona = c.req.header("cf-connecting-ip") ?? "local";
  const limite = await revisarLimite(c.env, persona);
  if (!limite.permitido) {
    if (limite.reintentarEnSegundos) c.header("Retry-After", String(limite.reintentarEnSegundos));
    return c.json({ error: MENSAJES_LIMITE[limite.motivo ?? "minuto"] }, 429);
  }

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
  return c.json({
    pregunta,
    coleccion: esquema === "anfibios" ? "amphibia" : "aves",
    sql,
    proveedor_llm: proveedor,
    intentos,
    tiempos,
    ...resultado,
  });
});

// Fotos y audios con licencia CC de una observación de iNaturalist (ver multimedia.ts).
app.get("/multimedia", async (c) => {
  const id = idDeObservacion(c.req.query("url"));
  if (!id) return c.json({ error: "Solo se aceptan observaciones de iNaturalist" }, 400);
  const persona = c.req.header("cf-connecting-ip") ?? "local";
  const limite = await c.env.LIMITE.getByName(`multimedia:${persona}`).consumir(60, 600);
  if (!limite.permitido) return c.json({ error: MENSAJES_LIMITE[limite.motivo ?? "minuto"] }, 429);
  try {
    return c.json(await multimediaDe(id, c.executionCtx));
  } catch (e) {
    console.warn(`Multimedia ${id}: ${e}`);
    return c.json({ error: "No se pudo traer la multimedia de iNaturalist" }, 502);
  }
});

app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));
app.onError((e, c) => {
  console.error(`Error no controlado: ${e}`);
  return c.json({ error: "Error interno" }, 500);
});

export default app;
