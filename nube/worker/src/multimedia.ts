// ============================================================
// Fotos y audios de una observación de iNaturalist, para la página.
// GET /multimedia?url=https://www.inaturalist.org/observations/<id>
//
// Solo se devuelven los archivos con licencia Creative Commons: los que
// dicen «todos los derechos reservados» se quedan como enlace a iNaturalist.
// Cada respuesta se guarda un día en la caché del Worker, para no cargar a
// iNaturalist (piden no pasar de ~1 consulta por segundo).
// ============================================================

export interface Archivo {
  url: string;
  grande?: string;
  tipo?: string;
  credito: string;
  licencia: string;
}

export interface Multimedia {
  enlace: string;
  fotos: Archivo[];
  sonidos: Archivo[];
}

const PATRON = /^https:\/\/(?:www\.)?inaturalist\.org\/observations\/(\d{1,12})\/?$/;
const UN_DIA = 86_400;

// iNaturalist manda el crédito en inglés; la página es en español.
const enEspanol = (t: string) =>
  t.replace("some rights reserved", "algunos derechos reservados").replace("no rights reserved", "sin derechos reservados");
const AGENTE = "biodiversidad.davidameth.dev (hola@davidameth.dev)";

interface FotoInat { url?: string; license_code?: string | null; attribution?: string }
interface SonidoInat { file_url?: string; license_code?: string | null; attribution?: string; file_content_type?: string }

export function idDeObservacion(url: string | undefined): string | null {
  return url ? PATRON.exec(url)?.[1] ?? null : null;
}

// "cc-by-nc" -> "CC BY-NC"; "cc0" -> "CC0".
const licencia = (codigo: string) => codigo.toUpperCase().replace(/^CC-/, "CC ");

export async function multimediaDe(id: string, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Multimedia> {
  const clave = new Request(`https://cache.interna/multimedia/v2/${id}`);
  const cache = caches.default;
  const guardada = await cache.match(clave);
  if (guardada) return guardada.json();

  const r = await fetch(`https://api.inaturalist.org/v1/observations/${id}`, {
    headers: { "User-Agent": AGENTE, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`iNaturalist respondió ${r.status}`);
  const datos = (await r.json()) as { results?: { photos?: FotoInat[]; sounds?: SonidoInat[] }[] };
  const obs = datos.results?.[0] ?? {};

  const resultado: Multimedia = {
    enlace: `https://www.inaturalist.org/observations/${id}`,
    fotos: (obs.photos ?? [])
      .filter((f) => f.url && f.license_code)
      .slice(0, 4)
      .map((f) => ({
        url: f.url!.replace("/square.", "/small."),
        grande: f.url!.replace("/square.", "/large."),
        credito: enEspanol(f.attribution ?? ""),
        licencia: licencia(f.license_code!),
      })),
    sonidos: (obs.sounds ?? [])
      .filter((s) => s.file_url && s.license_code)
      .slice(0, 2)
      .map((s) => ({
        url: s.file_url!,
        tipo: s.file_content_type,
        credito: enEspanol(s.attribution ?? ""),
        licencia: licencia(s.license_code!),
      })),
  };
  const respuesta = new Response(JSON.stringify(resultado), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${UN_DIA}` },
  });
  ctx.waitUntil(cache.put(clave, respuesta.clone()));
  return resultado;
}
