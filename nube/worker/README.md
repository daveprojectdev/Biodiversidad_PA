# API en Cloudflare Workers (Hono)

Fase 3 de la migración: el port de `app/app_flask.py` a un Worker, sin la voz
(fase 4). Recibe una pregunta en español, pide el SQL a un modelo, lo corre en
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

`coleccion` acepta `amphibia` (como el frontend entregado), `anfibios` o `aves`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/prompt.ts` | El prompt de la app, con las reglas de Postgres (sección «DIALECTO POSTGRESQL») |
| `src/sql.ts` | Validación del SQL (solo `SELECT`), `LIMIT`, esquema delante de cada tabla, columnas de multimedia, y `ILIKE` → `LIKE` |
| `src/llm.ts` | Cascada Groq (`openai/gpt-oss-20b`) → modelos de Gemini en orden (`GEMINI_MODELOS`), por `fetch` |
| `src/db.ts` | Consultas a Neon por HTTP en una transacción de solo lectura |
| `src/multimedia.ts` | Fotos y audios de iNaturalist (solo licencia CC), con caché |
| `src/limite.ts` | Límite por persona (minuto y día) y tope diario global, con un Durable Object |
| `src/index.ts` | Rutas, guarda de colección y autocorrección (hasta 3 intentos con el error de Postgres) |
| `scripts/dev.mjs` | `wrangler dev` con el token de `nube/.env` en el entorno |
| `scripts/generar_mapa.py` | Genera `nube/web/mapa-panama.svg` desde geoBoundaries |
| `scripts/preparar-dev-vars.mjs` | Arma `.dev.vars` desde `app/.env` y `nube/.env`, sin mostrar valores |
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

## Límites y cuotas

- Por persona (IP): 15 consultas por minuto (como `/consultar` en Flask) y 60
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
