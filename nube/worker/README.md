# API en Cloudflare Workers (Hono)

Fases 3 y 4 de la migración: el port de `app/app_flask.py` a un Worker, con la
voz desde el 2026-10-16. Recibe una pregunta en español, pide el SQL a un modelo, lo corre en
Neon con el rol de solo lectura y devuelve las filas, con la misma forma de
respuesta que la app de Flask.

## Rutas

| Ruta | Qué hace |
|---|---|
| `GET /` | La página (`nube/web`, ver su README), servida como archivos estáticos |
| `GET /estado` | Servidor vivo y colecciones |
| `GET /explorar?coleccion=amphibia\|aves` | Panorama de la colección, SQL fijo, sin modelo (incluye especies y avistamientos por provincia) |
| `POST /consultar` `{pregunta, coleccion}` | Pregunta → SQL → filas, con `tiempos` (modelo y base, en ms) e `intentos` |
| `GET /multimedia?url=<observación de iNaturalist>` | Fotos y audios con licencia CC de esa observación, con crédito; caché de un día y 60 por minuto por persona |
| `POST /transcribir` (cuerpo: el audio, `Content-Type` `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg` o `audio/wav`; hasta 2 MB) | Texto de la pregunta hablada, con Groq `whisper-large-v3-turbo` en español: `{texto, modelo, ms}` |
| `POST /hablar` `{total, fila}` (cuántas filas trajo la respuesta y la fila si es una sola) | Arma la frase y devuelve el MP3 con la voz `es-PA-RobertoNeural`; `X-Voz-Cache: hit` si salió de la caché. No acepta texto libre. Si Microsoft no responde, 503 |

`coleccion` acepta `amphibia` (como el frontend entregado), `anfibios` o `aves`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/prompt.ts` | El prompt de la app, con las reglas de Postgres (sección «DIALECTO POSTGRESQL») |
| `src/sql.ts` | Validación del SQL (solo `SELECT`), `LIMIT`, esquema delante de cada tabla, columnas de multimedia, y `ILIKE` → `LIKE` |
| `src/llm.ts` | Cascada Groq (`openai/gpt-oss-20b`) → modelos de Gemini en orden (`GEMINI_MODELOS`), por `fetch` |
| `src/db.ts` | Consultas a Neon por HTTP en una transacción de solo lectura |
| `src/multimedia.ts` | Fotos y audios de una observación de iNaturalist, pedidos a GBIF (iNaturalist da 429 a las IP de Cloudflare); solo licencia CC, con caché |
| `src/voz.ts` | Transcripción con Groq y cliente propio del servicio de voz de Microsoft Edge (WebSocket), con caché de 30 días por texto |
| `src/drm.ts` | El token `Sec-MS-GEC` (versión 2) que ese servicio exige |
| `src/limite.ts` | Límite por persona (minuto y día) y tope diario global, con un Durable Object |
| `src/index.ts` | Rutas, guarda de colección y autocorrección (hasta 3 intentos con el error de Postgres) |
| `scripts/dev.mjs` | `wrangler dev` con el token de `nube/.env` en el entorno |
| `scripts/generar_mapa.py` | Genera `nube/web/mapa-panama.svg` desde geoBoundaries |
| `scripts/preparar-dev-vars.mjs` | Arma `.dev.vars` desde `app/.env` y `nube/.env`, sin mostrar valores |
| `scripts/probar-drm.mjs` | Compara el token de `drm.ts` con el del paquete `edge-tts` de Python |
| `scripts/validar_rubrica.py` | Las 10 preguntas de la rúbrica por el Worker, contra el SQL de referencia |
| `validacion_*.txt` | Informes de la validación, con el proveedor que respondió |

## Cómo se corre en local

Desde `nube/worker/`:

```
npm install
npm run vars
npm run dev
```

`wrangler` se usa solo desde `nube/`, con `CLOUDFLARE_API_TOKEN` de `nube/.env`
en el entorno. **Nunca `wrangler login`**: la sesión guardada en este equipo es
de otra cuenta.

Con el Worker corriendo, desde la raíz del repo:

```
python nube/worker/scripts/validar_rubrica.py --pausa 70
```

La pausa larga es por la cuota gratis de Groq (abajo). Resultado del
2026-10-16: 10 de 10 en anfibios por Groq, y 10 de 10 en cada colección por el
respaldo (`gemini-3.5-flash-lite`, con Groq ya sin cuota del día). Aves por
Groq con razonamiento bajo queda por correr cuando se renueve la cuota; con el
razonamiento normal dio 9 de 9 respondidas.

Ojo con lo que la validación da por bueno: la regla «LIMIT 10 por defecto» del
prompt (heredada de la app) corta las listas. «¿Qué especies se vieron en Bocas
del Toro?» muestra 10 de 38 (de 367 en aves) y «¿En qué provincias se ha visto
Tyrannus melancholicus?» 10 de 13. Las 10 filas son correctas, pero no están
todas.

## La voz (fase 4)

Lo que en la app de Flask hacían faster-whisper y edge-tts en el mismo equipo:

- **Entrada:** la página graba (MediaRecorder) y manda el audio a
  `/transcribir`, que lo pasa a Groq `whisper-large-v3-turbo` con la misma
  `GROQ_API_KEY`. Whisper tiene cuota aparte de la del modelo de SQL (en el
  plan gratis, 2.000 audios al día), así que hablar no resta preguntas: la
  pregunta transcrita pasa después por `/consultar` como una escrita. Medido
  el 2026-10-16: unos 500 ms por pregunta.
- **Salida:** `/hablar` sintetiza con `es-PA-RobertoNeural`, la voz de la app
  entregada, desde el servicio de lectura en voz alta de Microsoft Edge (el
  que usa edge-tts). El cliente es propio (`voz.ts`, sin dependencias, para no
  arrastrar la AGPL de `@edge-tts/universal`): abre el WebSocket con los
  encabezados del navegador Edge y el token de `drm.ts`, manda la
  configuración y el SSML y junta el MP3. El token v2 se reescribió a partir
  de edge-tts 7.3.1 (rany2, `drm.py`); sin él, el servicio responde 403, como
  le pasó a la app local hasta actualizar edge-tts. Si Microsoft cambia el
  protocolo, `npm run probar-drm` (con edge-tts actualizado en Python) dice
  si el token sigue igual.
- **Caché:** cada audio se guarda 30 días (Cache API) por voz y texto. Muchas
  respuestas se repiten («Se encontraron 10 resultados…»), así que la mayoría
  no llega a Microsoft. Medido en local: 1,3 s la primera vez, 0,25 s desde la
  caché.
- **Respaldo:** si `/hablar` falla, la página habla con la voz del navegador
  (`speechSynthesis`, en español). Si el navegador no puede grabar o
  `/transcribir` falla, queda el dictado del navegador (Web Speech API).
- **Límites por persona:** `/transcribir` 10 por minuto y 100 por día (y 1.500
  al día en todo el sistema, debajo de la cuota de Groq); `/hablar` 20 por
  minuto y 200 por día.

El texto que se dice es el de `formatear_respuesta_hablada` de la app, armado
en el Worker (`textoHablado` en `voz.ts`): un resultado de hasta 4 campos, de
hasta 80 caracteres cada uno, se lee entero; si no, solo cuántos resultados
hay. La página tiene una copia de esa función solo para la voz del navegador.

## En producción

El Worker está desplegado en la cuenta de Cloudflare de biodiversidad sin
dirección pública propia; lo usa Pages, que sirve el sitio en
https://biodiversidad.davidameth.dev. Cómo se publica, en `nube/pages/README.md`.

## Seguridad (revisión del 2026-10-16)

Una revisión de seguridad del 2026-10-16 no encontró nada crítico ni alto y
comprobó en producción que la base aguanta una inyección en la pregunta: el
modelo obedece, pero el rol es de solo lectura, la transacción también y cada
consulta corta a los 10 s. Lo que se arregló:

- **Límite por persona:** con IPv6 cuenta el bloque /64 entero, no la
  dirección (`clavePersona` en `limite.ts`). Cada ruta tiene además su tope
  diario global (`/multimedia` 20.000, `/hablar` 3.000, `/transcribir` 1.500)
  y cada contador se borra solo tras 48 h sin uso.
- **Solo la página:** los POST que vienen de otro sitio (`Origin` fuera de
  `ORIGENES` o `Sec-Fetch-Site: cross-site`) reciben 403, y `/consultar` y
  `/hablar` exigen `application/json`. Antes, otra web podía gastar el cupo de
  sus visitantes con un POST `text/plain`.
- **Tamaños:** el cuerpo se mide antes de leerlo (16 KB para JSON, 2 MB para
  audio) y una respuesta de más de 1 MB no se devuelve.
- **Filas:** el `LIMIT` del modelo vale solo si es el único, va al final y no
  pasa de 100; si no, la consulta se envuelve en otra con `LIMIT 100`. Antes
  un `LIMIT 1000000` o uno en una subconsulta dejaba salir tablas enteras.
- **Funciones bloqueadas** (`sql.ts`): `query_to_xml` y familia, `xpath`,
  `information_schema`, `current_setting`, `repeat`, `lpad`, `rpad`,
  `generate_series`, `chr`, `version` y otras: ninguna pregunta las necesita y
  servían para ejecutar SQL armado como texto o para inflar la base.
- **Errores:** la persona ve «No se pudo responder esa pregunta. Prueba a
  hacerla de otra forma.»; el error exacto de Postgres solo va al registro y
  al modelo, para que se corrija.
- **Rol lector:** `work_mem` de 8 MB. Neon no deja fijar `temp_file_limit`.
- **`/hablar`** ya no lee texto libre (ver arriba): no sirve de lector de voz
  gratis.

Queda abierto: `biodiversidad.pages.dev` también sirve la API (mismo
límite); el plan de la cuenta de Cloudflare define cuántas peticiones a
Durable Objects hay al día (100.000 en el gratis).

## Límites y cuotas

- Por persona (IP, o su bloque /64 si es IPv6): 15 consultas por minuto (como `/consultar` en Flask) y 60
  por día. Tope de todo el sistema: 800 por día. Se cambian en `wrangler.jsonc`.
- **Las cuotas gratis son el cuello de botella** (medido el 2026-10-15/16).
  Cada pregunta gasta de 3.000 a 5.500 tokens, casi todo el prompt (el glosario
  de aves pesa más).
  - Groq, `gpt-oss-20b`: 8.000 tokens por minuto y 200.000 por día, o sea
    unas 2 preguntas por minuto y unas 40 al día en todo el sistema.
  - Gemini, `gemini-2.5-flash`: 20 peticiones al día.
  - Gemini, `gemini-3.5-flash-lite`: cuota propia, no medida todavía.
  El razonamiento de `gpt-oss-20b` va en «bajo» (`reasoning_effort`): responde
  antes y gasta menos cuota. Cuando todos responden 429, el Worker contesta 503
  con «Intenta de nuevo en un minuto». El tope global de 800 al día no se
  alcanza con estas cuotas: es para cuando haya un plan de pago.

## Diferencias con la app de Flask

- Sin Ollama (no hay GPU en la nube): la cascada empieza en Groq.
- Sin token de demo: el acceso es abierto, con límite por persona.
- El SQL que se muestra lleva el esquema (`anfibios.especie`) en vez de la base
  de MySQL.
- Si el modelo escribe `ILIKE`, se cambia por `LIKE` antes de ejecutar: con la
  colación de la base `ILIKE` da error, y `LIKE` ya ignora mayúsculas y
  acentos, así que el resultado es el mismo.
- Los errores de los proveedores no se le muestran al usuario; quedan en el
  registro del Worker.
