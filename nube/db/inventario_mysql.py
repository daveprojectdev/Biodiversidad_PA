"""Guarda el inventario de una base MySQL en nube/db/inventario_mysql/<coleccion>.sql.

    python nube/db/inventario_mysql.py               # anfibios

Saca el DDL real con SHOW CREATE TABLE, las columnas de la vista y la
firma de las rutinas. El cuerpo de la vista y de las rutinas no se
puede leer con biodiv_app (le falta SHOW VIEW y SHOW_ROUTINE): sus
scripts originales están en inventario_mysql/rutinas_origen/, y
comparar.py demuestra que el port se comporta igual.
"""
import argparse
from pathlib import Path

from comun import COLECCIONES, TABLAS, conectar_mysql


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coleccion", default="anfibios", choices=sorted(COLECCIONES))
    esquema = ap.parse_args().coleccion
    base = COLECCIONES[esquema]["mysql_db"]
    my = conectar_mysql(base)
    cur = my.cursor()
    cur.execute("SELECT VERSION()")
    out = [f"-- Inventario de {base} (MySQL {cur.fetchone()[0]}), generado por inventario_mysql.py", ""]

    for tabla in TABLAS:
        cur.execute(f"SELECT COUNT(*) FROM `{tabla}`")
        out.append(f"-- {tabla}: {cur.fetchone()[0]} filas")
        cur.execute(f"SHOW CREATE TABLE `{tabla}`")
        out += [cur.fetchone()[1] + ";", ""]

    cur.execute("SELECT column_name, column_type, collation_name FROM information_schema.columns "
                "WHERE table_schema = %s AND table_name = 'vista_avistamiento_completo' ORDER BY ordinal_position", (base,))
    out.append("-- vista_avistamiento_completo: columnas (el cuerpo está en rutinas_origen/actualizar_vista_nombre_comun.sql)")
    out += [f"--   {n} {t}" + (f" {c}" if c else "") for n, t, c in cur.fetchall()]
    out.append("")

    cur.execute("SELECT routine_type, routine_name, dtd_identifier FROM information_schema.routines "
                "WHERE routine_schema = %s ORDER BY routine_type, routine_name", (base,))
    rutinas = cur.fetchall()
    cur.execute("SELECT specific_name, parameter_name, dtd_identifier FROM information_schema.parameters "
                "WHERE specific_schema = %s AND ordinal_position > 0 ORDER BY specific_name, ordinal_position", (base,))
    params = {}
    for nombre, p, t in cur.fetchall():
        params.setdefault(nombre, []).append(f"{p} {t}")
    out.append(f"-- Rutinas ({len(rutinas)}; cuerpos en rutinas_origen/)")
    for tipo, nombre, ret in rutinas:
        firma = f"{tipo} {nombre}({', '.join(params.get(nombre, []))})"
        out.append(f"--   {firma}" + (f" RETURNS {ret}" if ret else ""))

    destino = Path(__file__).with_name("inventario_mysql") / f"{esquema}.sql"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Inventario: {destino}")


if __name__ == "__main__":
    main()
