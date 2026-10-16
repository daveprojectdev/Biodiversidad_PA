# Base de datos en la nube (Neon Postgres)

Fase 2 de la migración: la colección de anfibios pasa de MySQL (la versión
local entregada) a Postgres en Neon, y una comparación automática demuestra
que da los mismos resultados.

## Dónde vive

- Neon, proyecto `Biodiversidad_PA` (`long-wave-17659536`), rama `production`,
  Postgres 18, base `biodiversidad`.
- Un esquema por colección: `anfibios` hoy, `aves` después (misma plantilla).
- Las cadenas de conexión están en `nube/.env`, que no se sube:
  - `DATABASE_URL_OWNER`: dueño de la base, solo para cargar y migrar.
  - `DATABASE_URL_LECTOR`: `biodiv_lector`, el rol de la app.

## Archivos

| Archivo | Qué hace |
|---|---|
| `sql/00_comun.sql` | Colación `es_ci_ai` y tipo `texto_ci`, compartidos por todas las colecciones |
| `sql/10_esquema.sql` | Las 7 tablas (plantilla `{{esquema}}`) |
| `sql/20_vista.sql` | `vista_avistamiento_completo` |
| `sql/30_funciones.sql` | `fn_temporada`, `fn_disponibilidad_multimedia` y los 10 `sp_*` |
| `sql/40_rol_lector.sql` | Permisos del rol de la app |
| `migrar.py` | Borra el esquema, lo recrea y copia los datos desde MySQL |
| `comparar.py` | Corre lo mismo en los dos motores y compara fila por fila |
| `inventario_mysql.py` | Guarda el DDL real de MySQL en `inventario_mysql/` |
| `comparacion_anfibios.txt` | El último informe de `comparar.py` |

## Cómo se corre

Desde la raíz del repo, con MySQL local encendido:

```
pip install -r nube/db/requirements.txt
python nube/db/migrar.py
python nube/db/comparar.py
```

`comparar.py` sale con código 1 si algo difiere.

## Decisiones del port

- **Mayúsculas y acentos.** MySQL usa `utf8mb4_unicode_ci`: `'colon'` encuentra
  `'Colón'`. Aquí todo el texto usa una colación ICU no determinista de nivel 1
  (`und-u-ks-level1`), que hace lo mismo en `=`, `IN`, `LIKE`, `GROUP BY`,
  `DISTINCT`, `ORDER BY` y en las llaves únicas.
- **Lo que no funciona con esa colación:** `ILIKE` y las expresiones regulares
  (`~`, `SIMILAR TO`) dan error. No hacen falta (el `LIKE` ya ignora mayúsculas
  y acentos), pero el prompt de Postgres debe pedirle al modelo `LIKE`.
- **Espacios al final.** MySQL los ignora al comparar y Postgres no. Hoy ningún
  valor termina en espacio (`comparar.py` lo vigila).
- **Procedimientos.** Postgres no tiene procedimientos que devuelvan filas: cada
  `sp_*` es una función que devuelve una tabla. `CALL sp_x(2025)` pasa a ser
  `SELECT * FROM sp_x(2025)`.
- **Tipos.** `tinyint` pasa a `smallint`; `AUTO_INCREMENT` a identidad, que sigue
  donde iba MySQL. Los parámetros enteros de las funciones son `integer` para
  que `fn_temporada(1)` funcione sin conversión.
- **Rol de la app.** `biodiv_lector` solo puede `SELECT` y ejecutar las
  funciones, igual que `biodiv_app` en MySQL; sus transacciones son de solo
  lectura y cada consulta se corta a los 10 s. Se crea por SQL, no con
  `neonctl`: los roles de `neonctl` entran en `neon_superuser`. Su `search_path`
  por defecto es `anfibios`; con aves, la app lo fijará por conexión.

## Inventario de MySQL

`inventario_mysql/anfibios.sql` sale de `SHOW CREATE TABLE`. El cuerpo de la
vista y de las rutinas no se puede leer con `biodiv_app` (le faltan `SHOW VIEW`
y `SHOW_ROUTINE`), así que se usaron los scripts con que se crearon, guardados
en `inventario_mysql/rutinas_origen/`. La vista que corre hoy es la de
`actualizar_vista_nombre_comun.sql` (con `nombre_comun`), no la de
`database/vista_avistamiento_completo.sql`, que es anterior. `comparar.py`
confirma que el port se comporta igual.
