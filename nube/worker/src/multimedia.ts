// ============================================================
// Fotos y audios de una observación de iNaturalist, para la página.
// GET /multimedia?url=https://www.inaturalist.org/observations/<id>
//
// Se piden a GBIF (de donde salieron los datos) y no a la API de
// iNaturalist: iNaturalist responde 429 a las IP compartidas de Cloudflare.
// GBIF solo publica material con licencia Creative Commons, con su autor;
// los archivos «todos los derechos reservados» no aparecen y la página deja
// el enlace a iNaturalist. Cada respuesta se guarda un día en la caché.
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
const AGENTE = "biodiversidad.davidameth.dev (hola@davidameth.dev)";
// Solo estos servidores están permitidos en la CSP de la página (nube/web/_headers).
const SERVIDORES = /^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\//;

interface MediaGbif {
  type?: string;
  format?: string;
  identifier?: string;
  license?: string;
  rightsHolder?: string;
  creator?: string;
}

export function idDeObservacion(url: string | undefined): string | null {
  return url ? PATRON.exec(url)?.[1] ?? null : null;
}

// "http://creativecommons.org/licenses/by-nc/4.0/" -> "CC BY-NC";
// ".../publicdomain/zero/1.0/" -> "CC0". Lo que no sea CC devuelve null.
function licencia(url: string | undefined): string | null {
  if (!url || !/creativecommons\.org/.test(url)) return null;
  if (/publicdomain\/zero/.test(url)) return "CC0";
  const m = /licenses\/([a-z-]+)\//.exec(url);
  return m ? `CC ${m[1].toUpperCase()}` : null;
}

function credito(m: MediaGbif, lic: string): string {
  const autor = m.rightsHolder || m.creator || "autor de iNaturalist";
  return lic === "CC0" ? `${autor}, sin derechos reservados (CC0)` : `(c) ${autor}, algunos derechos reservados (${lic})`;
}

export async function multimediaDe(id: string, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Multimedia> {
  const clave = new Request(`https://cache.interna/multimedia/v3/${id}`);
  const cache = caches.default;
  const guardada = await cache.match(clave);
  if (guardada) return guardada.json();

  const enlace = `https://www.inaturalist.org/observations/${id}`;
  const r = await fetch(`https://api.gbif.org/v1/occurrence/search?occurrenceID=${encodeURIComponent(enlace)}&limit=1`, {
    headers: { "User-Agent": AGENTE, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`GBIF respondió ${r.status}`);
  const datos = (await r.json()) as { results?: { media?: MediaGbif[] }[] };
  const media = (datos.results?.[0]?.media ?? []).filter((m) => m.identifier && SERVIDORES.test(m.identifier));

  const fotos: Archivo[] = [];
  const sonidos: Archivo[] = [];
  for (const m of media) {
    const lic = licencia(m.license);
    if (!lic) continue;
    if (m.type === "StillImage" && fotos.length < 4) {
      const url = m.identifier!;
      fotos.push({ url: url.replace("/original.", "/small."), grande: url.replace("/original.", "/large."), credito: credito(m, lic), licencia: lic });
    } else if (m.type === "Sound" && sonidos.length < 2) {
      sonidos.push({ url: m.identifier!, tipo: m.format, credito: credito(m, lic), licencia: lic });
    }
  }

  const resultado: Multimedia = { enlace, fotos, sonidos };
  const respuesta = new Response(JSON.stringify(resultado), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${UN_DIA}` },
  });
  ctx.waitUntil(cache.put(clave, respuesta.clone()));
  return resultado;
}
