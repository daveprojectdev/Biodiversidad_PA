"""Copia una colección de MySQL a Postgres (Neon), de cero.

    python nube/db/migrar.py               # anfibios
    python nube/db/migrar.py --coleccion aves

Es reproducible: borra el esquema de la colección y lo vuelve a
crear con los archivos de nube/db/sql/, copia las 7 tablas fila
por fila desde MySQL y da los permisos al rol de solo lectura.
La primera vez crea el rol biodiv_lector con una contraseña al
azar y guarda su cadena de conexión en nube/.env (nunca en pantalla).
"""
import argparse
import re
import secrets
import sys
from urllib.parse import urlsplit, urlunsplit

from psycopg import sql

from comun import COLECCIONES, ENV_NUBE, TABLAS, conectar_mysql, conectar_pg, env_nube, leer_sql

sys.stdout.reconfigure(encoding="utf-8")

ROL_LECTOR = "biodiv_lector"


def asegurar_lector(pg):
    """Crea (o reinicia) el rol lector y deja su URL en nube/.env."""
    url_lector = env_nube().get("DATABASE_URL_LECTOR")
    if url_lector:
        clave = urlsplit(url_lector).password
    else:
        clave = secrets.token_urlsafe(24)
    existe = pg.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (ROL_LECTOR,)).fetchone()
    orden = "ALTER ROLE {} WITH LOGIN PASSWORD {}" if existe else "CREATE ROLE {} WITH LOGIN PASSWORD {}"
    pg.execute(sql.SQL(orden).format(sql.Identifier(ROL_LECTOR), sql.Literal(clave)))
    if not url_lector:
        dueno = urlsplit(env_nube()["DATABASE_URL_OWNER"])
        netloc = f"{ROL_LECTOR}:{clave}@{dueno.hostname}" + (f":{dueno.port}" if dueno.port else "")
        url_lector = urlunsplit((dueno.scheme, netloc, dueno.path, dueno.query, ""))
        txt = ENV_NUBE.read_text(encoding="utf-8")
        txt = re.sub(r"(?m)^DATABASE_URL_LECTOR=.*\n?", "", txt).rstrip("\n") + "\n"
        txt += ("\n# Neon: rol de solo lectura para la app (SELECT y EXECUTE, 10 s por consulta)\n"
                f"DATABASE_URL_LECTOR={url_lector}\n")
        ENV_NUBE.write_text(txt, encoding="utf-8")
        print(f"  rol {ROL_LECTOR} creado; su cadena quedó en nube/.env")


def copiar_tabla(my, pg, esquema, tabla):
    cur = my.cursor()
    cur.execute(f"SELECT * FROM `{tabla}` ORDER BY 1")
    columnas = [d[0] for d in cur.description]
    filas = cur.fetchall()
    destino = sql.SQL("COPY {}.{} ({}) FROM STDIN").format(
        sql.Identifier(esquema), sql.Identifier(tabla),
        sql.SQL(", ").join(map(sql.Identifier, columnas)))
    with pg.cursor().copy(destino) as copia:
        for fila in filas:
            copia.write_row(fila)
    # El siguiente id sigue donde iba el AUTO_INCREMENT de MySQL.
    pk = columnas[0]
    pg.execute(sql.SQL("SELECT setval(pg_get_serial_sequence({}, {}), (SELECT max({}) FROM {}.{}))").format(
        sql.Literal(f"{esquema}.{tabla}"), sql.Literal(pk), sql.Identifier(pk),
        sql.Identifier(esquema), sql.Identifier(tabla)))
    return len(filas)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coleccion", default="anfibios", choices=sorted(COLECCIONES))
    esquema = ap.parse_args().coleccion
    conf = COLECCIONES[esquema]

    my = conectar_mysql(conf["mysql_db"])
    with conectar_pg() as pg:  # una sola transacción: o queda todo o nada
        print(f"MySQL {conf['mysql_db']} -> Postgres esquema {esquema}")
        pg.execute(leer_sql("00_comun.sql", esquema))
        asegurar_lector(pg)
        pg.execute(leer_sql("10_esquema.sql", esquema))
        for tabla in TABLAS:
            n = copiar_tabla(my, pg, esquema, tabla)
            print(f"  {tabla:<13} {n:>6} filas")
        for tabla, texto in conf["comentarios"].items():
            pg.execute(sql.SQL("COMMENT ON TABLE {}.{} IS {}").format(
                sql.Identifier(esquema), sql.Identifier(tabla), sql.Literal(texto)))
        pg.execute(leer_sql("20_vista.sql", esquema))
        pg.execute(leer_sql("30_funciones.sql", esquema))
        pg.execute(leer_sql("40_rol_lector.sql", esquema))
    my.close()

    with conectar_pg(autocommit=True) as pg:
        pg.execute(sql.SQL("ANALYZE {}.avistamiento").format(sql.Identifier(esquema)))
    print("Listo.")


if __name__ == "__main__":
    main()
