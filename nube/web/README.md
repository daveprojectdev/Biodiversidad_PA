# Atlas vivo (la página de la versión en la nube)

La interfaz nueva, elegida por David el 2026-10-16 entre tres direcciones
(cuaderno de campo, instrumento nocturno y atlas): el mapa de Panamá es el
protagonista y cada respuesta se dibuja sobre él. El `frontend/` de la raíz es
el de la versión entregada y no se toca.

## Cómo funciona

- La sirve el mismo Worker (`nube/worker`, `assets` en `wrangler.jsonc`): misma
  dirección que la API, sin CORS y un solo despliegue.
- Al entrar, `GET /explorar` pinta las especies por provincia de la colección.
  No usa el modelo, así que no gasta cuota.
- Al preguntar, `POST /consultar`. Si la respuesta trae una columna de
  provincias, el mapa se pinta con ella: con la cantidad si la hay, o contando
  las filas por provincia. Si no trae provincias, vuelve al panorama.
- «Ver cómo funciona» muestra el proveedor, los tiempos reales (modelo y base)
  y el SQL ejecutado.
- Si el `LIMIT` del modelo cortó una lista (10 o más filas), la página lo dice.
- «Hablar» usa el dictado del navegador (Web Speech API) mientras no exista la
  voz propia (fase 4). Donde el navegador no lo tiene, el botón no aparece.
- Sin dependencias ni paso de compilación: `index.html`, `estilos.css`, `app.js`.

## El mapa

`mapa-panama.svg` (37 KB, 13 provincias y comarcas) se genera con
`nube/worker/scripts/generar_mapa.py` a partir de los límites de geoBoundaries
(2017, OpenStreetMap, ODbL 1.0); el pie de la página da la atribución.
«Kuna Yala» y «San Blas», como aparecen en los datos, caen en Guna Yala; «Sin
provincia» se informa debajo del mapa.

## Probar en local

```
cd nube/worker
npm run vars
npm run dev
```

y abrir http://localhost:8787. `npm run dev` pone el token de `nube/.env` en el
entorno de wrangler (nunca `wrangler login`).
