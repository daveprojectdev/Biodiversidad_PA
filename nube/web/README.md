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
- Fotos y audios: de las observaciones de iNaturalist en la respuesta, las 6
  primeras muestran su foto (se agranda al tocarla) o su audio, con autor y
  licencia, vía `GET /multimedia`. Solo se muestran archivos con licencia
  Creative Commons; los de «todos los derechos reservados» y las demás fuentes
  (observation.org) quedan como enlace.
- Color por colección: verde para anfibios y ámbar para aves (elegido por
  David; va con el pico del tucán). El tono del texto y los botones (`--c`)
  cumple 5:1 sobre blanco; el mapa usa la escala `--c1` a `--c4`.
- «Hablar» usa el dictado del navegador (Web Speech API) mientras no exista la
  voz propia (fase 4). Donde el navegador no lo tiene, el botón no aparece.
- Mascotas, pedidas por David: con Anfibios, la rana de ojos rojos (*Agalychnis
  callidryas*) en su nenúfar (se probó la rana dorada y David prefirió esta);
  con Aves, un tucán pico iris (*Ramphastos sulfuratus*, el tucán más avistado:
  580 avistamientos en 11 provincias) en una rama; antes fue un tirano tropical. Flotan en el Pacífico del mapa. La rana da un
  saltito cada 8 s y croa; el ave salta de la rama, aletea y vuela un poco cada
  9 s. Con un clic, la rana da un salto grande y el ave un vuelo corto. Son SVG
  en `index.html`, animadas solo con transform y opacity, y se quedan quietas
  con «reducir movimiento».
- Modo oscuro: sigue al sistema; el selector de la cabecera (claro, oscuro,
  sistema) lo fija y se recuerda en el navegador. `tema.js` lo aplica antes de
  pintar, sin destello. En el mapa oscuro, más = más brillante; el tucán lleva
  un contorno claro para no perderse en el mar. Todo el texto pasa de 7:1.
- Sin dependencias ni paso de compilación: `index.html`, `estilos.css`, `app.js`, `tema.js`.

## Íconos y citas

- `favicon.svg` es la cara de la rana de ojos rojos (elegida por David);
  `favicon-32.png` y `apple-touch-icon.png` salen de
  `nube/worker/scripts/iconos.py` con el mismo dibujo.
- El pie cita los dos DOI de GBIF (anfibios `10.15468/dl.zcy9ys`, aves
  `10.15468/dl.qpx3vw`); la cita completa está en el README de la raíz.

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
