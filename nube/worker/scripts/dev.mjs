// `npm run dev`: wrangler dev con el token de nube/.env en el entorno, para
// que nunca use la sesión OAuth guardada en este equipo (es de otra cuenta).
// No imprime el token.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(aqui, "..", "..", ".env"), "utf8");
const token = /^CLOUDFLARE_API_TOKEN=(.*)$/m.exec(env)?.[1]?.trim();
if (!token) {
  console.error("Falta CLOUDFLARE_API_TOKEN en nube/.env");
  process.exit(1);
}
const hijo = spawn("npx", ["wrangler", "dev", "--port", "8787", ...process.argv.slice(2)], {
  cwd: join(aqui, ".."),
  stdio: "inherit",
  shell: true,
  env: { ...process.env, CLOUDFLARE_API_TOKEN: token, WRANGLER_SEND_METRICS: "false" },
});
hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
