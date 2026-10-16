// ============================================================
// Consultas a Neon por HTTP con el rol biodiv_lector (solo lectura,
// 10 s por consulta: ver nube/db/sql/40_rol_lector.sql).
// ============================================================
import { neon } from "@neondatabase/serverless";
import type { Coleccion } from "./colecciones";

export type Fila = Record<string, unknown>;

// Como en la app de Flask, los conteos y las coordenadas salen como
// números (el driver los da como texto) y las fechas como 'AAAA-MM-DD'.
// Se convierten aquí, por el tipo de cada columna: el driver no acepta
// conversores por consulta dentro de una transacción.
const INT8 = 20;
const NUMERIC = 1700;
const DATE = 1082;

function convertir(tipo: number, v: unknown): unknown {
  if (v === null) return v;
  if (tipo === INT8 || tipo === NUMERIC) return Number(v);
  // El runtime de Workers está en UTC: la fecha de medianoche sale exacta.
  if (tipo === DATE && v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

// Corre una consulta dentro del esquema de la colección, en una
// transacción de solo lectura. El search_path hace falta para las
// funciones (fn_temporada...) que el SQL nombra sin esquema.
export async function consultar(url: string, esquema: Coleccion, sql: string): Promise<Fila[]> {
  const db = neon(url);
  const resultados = await db.transaction(
    (txn) => [txn`SELECT set_config('search_path', ${`${esquema}, public`}, true)`, txn.query(sql)],
    { readOnly: true, fullResults: true },
  );
  const { fields, rows } = resultados[1];
  return rows.map((fila) => {
    const salida: Fila = {};
    for (const campo of fields) salida[campo.name] = convertir(campo.dataTypeID, (fila as Fila)[campo.name]);
    return salida;
  });
}
