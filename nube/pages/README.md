# Publicación en Cloudflare Pages

El sitio público es **https://biodiversidad.davidameth.dev**.

- **Pages** (proyecto `biodiversidad`, `biodiversidad.pages.dev`) sirve
  `nube/web` y reenvía `/consultar`, `/explorar`, `/multimedia`, `/estado`,
  `/transcribir` y `/hablar` al
  Worker `biodiversidad-api` por un service binding (`functions/*.js`).
- **El Worker** no tiene dirección pública propia (`workers_dev: false`): solo
  lo llama Pages.
- **Por qué Pages y no un Worker con dominio propio:** davidameth.dev tiene su
  DNS en Spaceship, no en Cloudflare. Un Worker solo admite dominios de zonas
  de Cloudflare; Pages acepta un CNAME desde fuera.

- **Direcciones que no existen:** `nube/web/404.html` hace que Pages responda
  404 con esa página (sin ella devolvía la portada con 200, como si existiera).

## DNS (en Spaceship, lo crea David)

| Tipo | Host | Valor |
|---|---|---|
| CNAME | `biodiversidad` | `biodiversidad.pages.dev` |

El destino es el dominio fijo del proyecto, nunca el de un despliegue
(`a56722b1.biodiversidad.pages.dev`), que queda congelado en esa versión. Los
CAA de davidameth.dev ya permiten a Google (`pki.goog`) y Let's Encrypt, que
son quienes emiten el certificado de Pages.

## Publicar una versión nueva

Siempre con `CLOUDFLARE_API_TOKEN` de `nube/.env` en el entorno, nunca
`wrangler login` (la sesión guardada en este equipo es de otra cuenta).

```
cd nube/worker
npx wrangler deploy            # si cambió el Worker
npx wrangler secret bulk .dev.vars   # solo si cambió algún secreto

cd ../pages
../worker/node_modules/.bin/wrangler pages deploy --branch main
```

La primera vez hizo falta, además: abrir «Workers y Pages» en el panel (crea el
subdominio workers.dev, que Cloudflare exige aunque no se use),
`wrangler pages project create biodiversidad --production-branch main` y
agregar el dominio al proyecto (API de Pages, `POST .../domains`).
