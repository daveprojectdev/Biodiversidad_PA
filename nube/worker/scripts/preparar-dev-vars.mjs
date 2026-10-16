// Arma nube/worker/.dev.vars (ignorado por git) con los secretos que
// `wrangler dev` necesita, leyéndolos de app/.env y nube/.env.
// No imprime ningún valor.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..", "..");

function leerEnv(ruta) {
  const valores = {};
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return valores;
}

const app = leerEnv(join(raiz, "app", ".env"));
const nube = leerEnv(join(raiz, "nube", ".env"));
const vars = {
  GROQ_API_KEY: app.GROQ_API_KEY,
  GEMINI_API_KEY: app.GEMINI_API_KEY,
  DATABASE_URL: nube.DATABASE_URL_LECTOR,
};
const faltan = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
if (faltan.length) {
  console.error(`Faltan: ${faltan.join(", ")}`);
  process.exit(1);
}
writeFileSync(
  join(aqui, "..", ".dev.vars"),
  Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
);
console.log(`.dev.vars listo con ${Object.keys(vars).join(", ")}`);
