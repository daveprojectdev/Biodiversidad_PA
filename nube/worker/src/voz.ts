// ============================================================
// La voz (fase 4): lo que hacían faster-whisper y edge-tts en
// app/app_flask.py, ahora desde el Worker.
//
// - Entrada: el audio grabado en la página va a Groq
//   (whisper-large-v3-turbo), con la misma clave que el modelo de SQL
//   pero con cuota propia.
// - Salida: la voz es-PA-RobertoNeural del servicio de lectura en voz
//   alta de Microsoft Edge, el mismo que usa edge-tts. Cliente propio:
//   una conexión WebSocket con los encabezados del navegador Edge y el
//   token de drm.ts. Cada audio se guarda en la caché, porque muchas
//   respuestas se repiten («Se encontraron 10 resultados…»).
// ============================================================
import { TOKEN_CLIENTE, tokenSecMsGec } from "./drm";

// ── Entrada: transcripción con Groq ──

export const MODELO_TRANSCRIPCION = "whisper-large-v3-turbo";
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // unos 30 s en cualquier formato del navegador

const EXTENSIONES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export function extensionDe(tipo: string | undefined): string | null {
  return EXTENSIONES[(tipo ?? "").split(";")[0].trim().toLowerCase()] ?? null;
}

export class CuotaAgotada extends Error {}

export async function transcribir(clave: string | undefined, audio: ArrayBuffer, extension: string): Promise<string> {
  if (!clave) throw new Error("falta GROQ_API_KEY");
  const formulario = new FormData();
  formulario.append("file", new File([audio], `pregunta.${extension}`));
  formulario.append("model", MODELO_TRANSCRIPCION);
  formulario.append("language", "es");
  formulario.append("temperature", "0");
  formulario.append("response_format", "json");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}` },
    body: formulario,
  });
  if (r.status === 429) throw new CuotaAgotada("Groq Whisper sin cuota");
  if (!r.ok) throw new Error(`Groq Whisper ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const datos = (await r.json()) as { text?: string };
  return (datos.text ?? "").trim();
}

// ── Salida: síntesis con la voz de Edge ──

export const VOZ = "es-PA-RobertoNeural";
const MAX_FILAS = 100; // el LIMIT que pone sql.ts
const MAX_VALOR_HABLADO = 80; // un valor más largo no se lee: se dice «1 resultado»
const NO_HABLABLES = new Set(["occurrence_url", "media_type"]);

/**
 * La frase que se dice, como formatear_respuesta_hablada de app/app_flask.py.
 * Se arma aquí, a partir de cuántas filas hubo y de la fila si es una sola,
 * para que /hablar no lea textos arbitrarios. null si los datos no sirven.
 */
export function textoHablado(total: unknown, fila: unknown): string | null {
  if (typeof total !== "number" || !Number.isInteger(total) || total < 0 || total > MAX_FILAS) return null;
  if (total === 0) return "No se encontraron resultados para tu pregunta.";
  if (total > 1) return `Se encontraron ${total} resultados. Revisa la tabla en pantalla para el detalle completo.`;
  const generico = "Se encontró 1 resultado. Revisa la pantalla para el detalle completo.";
  if (!fila || typeof fila !== "object" || Array.isArray(fila)) return generico;
  const valores = Object.entries(fila)
    .filter(([c, v]) => !NO_HABLABLES.has(c) && v != null)
    .map(([, v]) => v);
  const legibles = valores.every(
    (v) => (typeof v === "string" || typeof v === "number" || typeof v === "boolean") && String(v).length <= MAX_VALOR_HABLADO,
  );
  if (valores.length > 0 && valores.length <= 4 && legibles) return `El resultado es: ${valores.map(String).join(", ")}.`;
  return generico;
}

const VERSION_CHROMIUM = "143.0.3650.75";
const MAYOR = VERSION_CHROMIUM.split(".")[0];
const URL_VOZ = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

const aleatorioHex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Caracteres de control que el servicio rechaza (como edge-tts).
const limpiar = (t: string) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
const escaparXml = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

// Fecha al estilo de JavaScript que espera el servicio.
const fecha = () => new Date().toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) /, "$1 $3 $2 $4 ") + "+0000 (Coordinated Universal Time)";

function encabezados(texto: string): Record<string, string> {
  return Object.fromEntries(
    texto
      .split("\r\n")
      .filter((l) => l.includes(":"))
      .map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)]),
  );
}

/** Audio MP3 (24 kHz, 48 kbps) del texto con la voz de Roberto. */
export async function sintetizar(texto: string, plazoMs = 15_000): Promise<Uint8Array> {
  const url =
    `${URL_VOZ}?TrustedClientToken=${TOKEN_CLIENTE}&ConnectionId=${aleatorioHex(16)}` +
    `&Sec-MS-GEC=${tokenSecMsGec()}&Sec-MS-GEC-Version=2-${VERSION_CHROMIUM}`;
  const r = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent":
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
        `Chrome/${MAYOR}.0.0.0 Safari/537.36 Edg/${MAYOR}.0.0.0`,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: `muid=${aleatorioHex(16).toUpperCase()};`,
    },
  });
  const ws = r.webSocket;
  if (!ws) throw new Error(`El servicio de voz respondió ${r.status} sin WebSocket`);
  ws.accept();

  const partes: Uint8Array[] = [];
  const terminado = new Promise<void>((resolver, rechazar) => {
    const plazo = setTimeout(() => rechazar(new Error("El servicio de voz no terminó a tiempo")), plazoMs);
    const fin = (error?: Error) => {
      clearTimeout(plazo);
      try {
        ws.close(1000);
      } catch {}
      if (error) rechazar(error);
      else resolver();
    };
    // Los mensajes binarios pueden llegar como Blob, que se lee aparte: una
    // cola los procesa en orden para no desordenar el audio.
    let cola = Promise.resolve();
    const procesar = async (dato: string | ArrayBuffer | Blob) => {
      if (typeof dato === "string") {
        const cabeza = encabezados(dato.slice(0, dato.indexOf("\r\n\r\n")));
        if (cabeza.Path === "turn.end") fin();
        return;
      }
      // Binario: 2 bytes con el largo del encabezado, el encabezado y el audio.
      const datos = new Uint8Array(dato instanceof Blob ? await dato.arrayBuffer() : dato);
      if (datos.length < 2) return fin(new Error("Mensaje binario sin encabezado"));
      const largo = (datos[0] << 8) | datos[1];
      const cabeza = encabezados(new TextDecoder().decode(datos.subarray(2, 2 + largo)));
      if (cabeza.Path !== "audio") return fin(new Error(`Mensaje binario inesperado: ${cabeza.Path}`));
      const audio = datos.subarray(2 + largo);
      if (audio.length) partes.push(audio);
    };
    ws.addEventListener("message", (ev) => {
      cola = cola.then(() => procesar(ev.data as string | ArrayBuffer | Blob)).catch((e) => fin(e));
    });
    ws.addEventListener("close", () => {
      cola = cola.then(() => fin(partes.length ? undefined : new Error("El servicio de voz cerró sin audio")));
    });
    ws.addEventListener("error", () => fin(new Error("Error en el WebSocket de voz")));
  });

  ws.send(
    `X-Timestamp:${fecha()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
      '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n',
  );
  ws.send(
    `X-RequestId:${aleatorioHex(16)}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${fecha()}Z\r\nPath:ssml\r\n\r\n` +
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='es-PA'>` +
      `<voice name='${VOZ}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escaparXml(limpiar(texto))}</prosody></voice></speak>`,
  );
  await terminado;

  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) {
    total.set(p, o);
    o += p.length;
  }
  if (!total.length) throw new Error("El servicio de voz no devolvió audio");
  return total;
}

async function claveDeCache(texto: string): Promise<Request> {
  const resumen = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${VOZ}|${texto}`));
  const hexa = [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`https://cache.interna/voz/v1/${hexa}`);
}

/** El audio del texto, de la caché si ya se dijo antes (30 días). */
export async function audioDe(
  texto: string,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<{ audio: ArrayBuffer; deCache: boolean }> {
  const clave = await claveDeCache(texto);
  const cache = caches.default;
  const guardada = await cache.match(clave);
  if (guardada) return { audio: await guardada.arrayBuffer(), deCache: true };
  const audio = (await sintetizar(texto)).slice().buffer as ArrayBuffer;
  const respuesta = new Response(audio.slice(0), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": `public, max-age=${30 * 86_400}` },
  });
  ctx.waitUntil(cache.put(clave, respuesta));
  return { audio, deCache: false };
}
