// ============================================================
// Lo que se le hace al SQL del modelo antes de ejecutarlo.
// Port de las secciones 5, 5b y 5c de app/app_flask.py, más
// adaptarDialecto, que es nuevo.
// ============================================================
import type { Coleccion } from "./colecciones";

// Sección 5 — defensa contra SQL generado por el modelo. La lista es la
// de MySQL más lo propio de Postgres (COPY, DO, SET, CALL, pg_*); de todos
// modos el rol biodiv_lector no puede escribir.
const PALABRAS_PROHIBIDAS = [
  "DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE",
  "TRUNCATE", "EXEC", "EXECUTE", "GRANT", "REVOKE", "RENAME",
  "--", "/*", "*/", "XP_", "INTO OUTFILE", "LOAD_FILE",
  "PG_", "SET_CONFIG",
];
// Solo como palabra completa: «CALL» suelto bloquearía '%callidryas%'.
const PALABRAS_SUELTAS = ["DO", "SET", "CALL", "COPY"];
// Funciones que ninguna pregunta sobre avistamientos necesita y que sirven
// para atacar: ejecutar SQL armado como texto (saltándose esta lista),
// leer el catálogo o inflar memoria y tiempo de la base.
const FUNCIONES_PROHIBIDAS = [
  "QUERY_TO_XML", "QUERY_TO_XML_AND_XMLSCHEMA", "QUERY_TO_XMLSCHEMA", "CURSOR_TO_XML",
  "CURSOR_TO_XMLSCHEMA", "TABLE_TO_XML", "SCHEMA_TO_XML", "DATABASE_TO_XML", "XPATH",
  "XMLPARSE", "INFORMATION_SCHEMA", "CURRENT_SETTING", "DBLINK", "LO_IMPORT", "LO_GET",
  "REPEAT", "LPAD", "RPAD", "GENERATE_SERIES", "VERSION", "CHR",
];

export function esSqlSeguro(sql: string): [boolean, string] {
  if (!sql || !sql.trim()) return [false, "SQL vacío"];
  const limpio = sql.trim().replace(/;+\s*$/, "");
  if (limpio.includes(";")) return [false, "Múltiples sentencias no permitidas"];
  const arriba = limpio.toUpperCase();
  if (!arriba.startsWith("SELECT")) return [false, "Solo se permiten consultas SELECT"];
  for (const palabra of PALABRAS_PROHIBIDAS) {
    if (arriba.includes(palabra)) return [false, `Palabra prohibida detectada: ${palabra}`];
  }
  for (const palabra of [...PALABRAS_SUELTAS, ...FUNCIONES_PROHIBIDAS]) {
    if (new RegExp(`\\b${palabra}\\b`).test(arriba)) return [false, `Palabra prohibida detectada: ${palabra}`];
  }
  return [true, "OK"];
}

// Tope de filas. Antes, cualquier LIMIT en el texto (uno de 1.000.000, o
// uno dentro de una subconsulta) dejaba pasar tablas enteras. Ahora el
// LIMIT del modelo se respeta solo si es el único, va al final y no pasa
// del tope; si no hay ninguno se agrega, y en cualquier otro caso la
// consulta se envuelve en otra con el tope.
export function limitarFilas(sql: string, maxFilas = 100): string {
  const limpio = sql.trim().replace(/;+\s*$/, "");
  const limites = limpio.match(/\b(LIMIT|FETCH|OFFSET)\b/gi) ?? [];
  if (!limites.length) return `${limpio} LIMIT ${maxFilas}`;
  const final = /\bLIMIT\s+(\d+)\s*$/i.exec(limpio);
  if (limites.length === 1 && final && Number(final[1]) <= maxFilas) return limpio;
  return `SELECT * FROM (\n${limpio}\n) AS consulta LIMIT ${maxFilas}`;
}

// Sección 5b — antepone el esquema a cada tabla, para que el SQL que se
// muestra en pantalla funcione igual si alguien lo copia a otro cliente.
const TABLAS_CONOCIDAS = [
  "orden", "familia", "especie", "provincia",
  "observador", "fuente", "avistamiento",
  "vista_avistamiento_completo",
];
const PATRON_TABLA = new RegExp(
  String.raw`\b(FROM|JOIN)(\s+)(?:(\w+)\.)?(` + TABLAS_CONOCIDAS.join("|") + String.raw`)\b`,
  "gi",
);

export function calificarTablas(sql: string, esquema: Coleccion): string {
  return sql.replace(PATRON_TABLA, (todo, clave, espacio, yaCalificado, tabla) =>
    yaCalificado ? todo : `${clave}${espacio}${esquema}.${tabla}`,
  );
}

// Sección 5c — agrega occurrence_url y media_type cuando la consulta
// devuelve avistamientos individuales, para mostrar la foto o el audio.
const PALABRAS_AGREGACION = ["COUNT(", "SUM(", "AVG(", "MAX(", "MIN(", "GROUP BY"];

export function asegurarColumnasMultimedia(sql: string): string {
  const arriba = sql.toUpperCase();
  if (!arriba.includes("AVISTAMIENTO")) return sql;
  if (PALABRAS_AGREGACION.some((p) => arriba.includes(p))) return sql;
  if (arriba.includes("SELECT DISTINCT")) return sql;
  if (/SELECT\s+\*/i.test(sql) || /SELECT\s+\w+\.\*/i.test(sql)) return sql;
  if (arriba.includes("OCCURRENCE_URL") || arriba.includes("MEDIA_TYPE")) return sql;
  const m = /\bSELECT\b/i.exec(sql);
  if (!m) return sql;
  const pos = m.index + m[0].length;
  return sql.slice(0, pos) + " occurrence_url, media_type," + sql.slice(pos);
}

// Nuevo: lo más común que el modelo arrastra de MySQL y tiene arreglo
// seguro. ILIKE da error con la colación de la base, y LIKE ya ignora
// mayúsculas y acentos, así que el cambio no altera el resultado. Las
// comillas invertidas de MySQL pasan a comillas dobles de identificador.
// Lo demás (YEAR(), DATE_FORMAT...) lo corrige el reintento con el error.
export function adaptarDialecto(sql: string): string {
  return sql.replace(/\bILIKE\b/gi, "LIKE").replace(/`([A-Za-z_][A-Za-z0-9_]*)`/g, '"$1"');
}

export function limpiarSql(texto: string): string {
  return texto.trim().replaceAll("```sql", "").replaceAll("```", "").trim();
}
