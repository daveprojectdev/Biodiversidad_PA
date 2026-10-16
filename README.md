# Biodiversidad de Panamá

Consultas en lenguaje natural sobre la biodiversidad de Panamá: preguntas en
español, escritas o habladas, que un modelo de lenguaje convierte en SQL sobre
una base de datos real de avistamientos de anfibios y aves.

**En vivo:** https://biodiversidad.davidameth.dev («Atlas vivo»)
**Arquitectura:** https://davidameth.dev/proyectos/biodiversidad/

Nació como proyecto final de Base de Datos II en la Universidad Tecnológica de
Panamá (David Ameth Martínez Sánchez y Emanuel Quintero, profesor Rafael
Vejarano, julio de 2026) y en octubre de 2026 pasó a la nube.

## Organización

| Carpeta | Qué es |
|---|---|
| `app/`, `frontend/`, `database/` | La versión local entregada: Flask + MySQL, voz con Whisper y edge-tts. No se modifica. |
| `nube/db/` | Migración de MySQL a Postgres (Neon) y la comparación automática entre los dos motores |
| `nube/worker/` | La API en Cloudflare Workers con Hono |
| `nube/web/` | El Atlas vivo, la página |
| `nube/pages/` | La publicación en Cloudflare Pages |

## Datos

Los avistamientos vienen de GBIF, con licencia CC BY-NC 4.0. Citas:

- **Anfibios:** GBIF.org (7 May 2026) GBIF Occurrence Download
  https://doi.org/10.15468/dl.zcy9ys (8.430 registros)
- **Aves:** GBIF.org (13 May 2026) GBIF Occurrence Download
  https://doi.org/10.15468/dl.qpx3vw (56.203 registros en bruto; 51.761 tras la
  limpieza)

Los nombres de los observadores se publican tal como vienen en GBIF. Las fotos y
los audios que muestra el Atlas son de sus autores en iNaturalist, con la
licencia Creative Commons que cada uno eligió, y se citan junto a cada archivo.
Los límites del mapa son de geoBoundaries (2017), © colaboradores de
OpenStreetMap, ODbL 1.0.
