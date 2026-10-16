// ============================================================
// Cascada de modelos: los de Groq en orden (GROQ_MODELOS) -> los de Gemini.
// Port de la sección 8 de app/app_flask.py. Ollama no existe en la
// nube; las llamadas van por fetch a las API REST, sin SDK.
// ============================================================
import { limpiarSql } from "./sql";

export interface EnvLlm {
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_MODELOS: string; // separados por coma, en orden de preferencia; cada uno con su cuota
  GEMINI_MODELOS: string; // ídem
}

export type ResultadoLlm =
  | { sql: string; proveedor: string }
  | { error: string; proveedor?: string; ocupado?: boolean };

const FUERA_DE_ALCANCE = "ERROR_FUERA_DE_ALCANCE";
// gpt-oss razona antes de responder: a veces pasa de 25 s.
const ESPERA_MS = 45_000;

async function generarGroq(env: EnvLlm, pregunta: string, prompt: string, modelo: string): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error("falta GROQ_API_KEY");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: pregunta },
      ],
      temperature: 0.1,
      // Razonamiento corto en los gpt-oss: responde antes y gasta menos de la
      // cuota por minuto, que también cuenta los tokens del razonamiento.
      ...(modelo.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const datos = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const texto = datos.choices?.[0]?.message?.content;
  if (!texto) throw new Error("respuesta vacía");
  return limpiarSql(texto);
}

async function generarGemini(env: EnvLlm, pregunta: string, prompt: string, modelo: string): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new Error("falta GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: prompt }] },
        { role: "model", parts: [{ text: "Entendido. Listo para convertir preguntas en SQL." }] },
        { role: "user", parts: [{ text: pregunta }] },
      ],
      generationConfig: { temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const datos = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const texto = datos.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!texto) throw new Error("respuesta vacía");
  return limpiarSql(texto);
}

const lista = (texto: string) => texto.split(",").map((m) => m.trim()).filter(Boolean);

// Los modelos de Groq primero y después los de Gemini; cada modelo tiene su
// propia cuota diaria (gemini-2.5-flash gratis: solo 20 al día). El primero
// de Groq se llama «groq» a secas, como antes, para la página y los registros.
function proveedores(env: EnvLlm): [string, (pregunta: string, prompt: string) => Promise<string>][] {
  const lista_: [string, (pregunta: string, prompt: string) => Promise<string>][] = lista(env.GROQ_MODELOS).map(
    (modelo, i) => [i === 0 ? "groq" : `groq:${modelo}`, (p: string, s: string) => generarGroq(env, p, s, modelo)],
  );
  for (const modelo of lista(env.GEMINI_MODELOS)) {
    lista_.push([`gemini:${modelo}`, (p, s) => generarGemini(env, p, s, modelo)]);
  }
  return lista_;
}

export async function generarSqlCascada(env: EnvLlm, pregunta: string, prompt: string): Promise<ResultadoLlm> {
  const errores: string[] = [];
  let todosPorCuota = true;
  for (const [nombre, generar] of proveedores(env)) {
    try {
      const sql = await generar(pregunta, prompt);
      if (sql === FUERA_DE_ALCANCE) {
        return { error: "La pregunta está fuera del alcance de la base de datos", proveedor: nombre };
      }
      return { sql, proveedor: nombre };
    } catch (e) {
      console.warn(`Proveedor ${nombre} falló: ${e}`);
      errores.push(`${nombre}: ${e}`);
      if (!String(e).includes("HTTP 429")) todosPorCuota = false;
    }
  }
  // Con los planes gratis, Groq admite unas 2 preguntas por minuto en todo
  // el sistema (8.000 tokens por minuto y el prompt pesa 3.000-5.500).
  if (todosPorCuota) {
    return { error: "El sistema está atendiendo muchas preguntas. Intenta de nuevo en un minuto.", ocupado: true };
  }
  // Al usuario no se le muestran los detalles (llevarían fragmentos de la
  // respuesta del proveedor); quedan en el registro del Worker.
  return { error: "No se pudo generar la consulta en este momento. Intenta de nuevo en un rato." };
}
