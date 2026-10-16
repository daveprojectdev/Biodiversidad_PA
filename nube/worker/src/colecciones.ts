// Una colección = un esquema de Postgres (ver nube/db/README.md).
export type Coleccion = "anfibios" | "aves";

// El frontend entregado manda "amphibia"; se aceptan los dos nombres.
const ALIAS: Record<string, Coleccion> = {
  amphibia: "anfibios",
  anfibios: "anfibios",
  aves: "aves",
};

export function resolverColeccion(valor: unknown): Coleccion | null {
  if (valor === undefined || valor === null || valor === "") return "anfibios";
  return typeof valor === "string" ? ALIAS[valor.toLowerCase()] ?? null : null;
}
