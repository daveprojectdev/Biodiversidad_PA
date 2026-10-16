"""Compara MySQL (la versión local entregada) contra Postgres en Neon.

    python nube/db/comparar.py               # anfibios
    python nube/db/comparar.py --coleccion aves

Corre lo mismo en los dos motores y compara fila por fila:
  1. las consultas de database/consultas_referencia.sql (tal cual),
  2. los 10 procedimientos (CALL en MySQL, SELECT * FROM en Postgres),
  3. la batería de comprobación con sus valores esperados,
  4. las 2 funciones sobre todos sus valores posibles,
  5. la colación: búsquedas sin mayúsculas ni acentos,
  6. el conteo y el contenido completo de las 7 tablas y la vista,
  7. que el rol lector no pueda escribir.
En Postgres se conecta como biodiv_lector, el rol de la app; en
MySQL como biodiv_app. Escribe el informe en
nube/db/comparacion_<coleccion>.txt y sale con código 1 si algo difiere.
"""
import argparse
import warnings
import re
import sys
from pathlib import Path

from comun import COLECCIONES, RAIZ, TABLAS, conectar_mysql, conectar_pg

sys.stdout.reconfigure(encoding="utf-8")
# mysql-connector avisa que stored_results() cambiará de forma; hoy funciona.
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Los procedimientos y sus argumentos de prueba (los de los ejemplos de
# procedimientos_almacenados.sql, más casos sin acentos ni mayúsculas).
PROCEDIMIENTOS = [
    ("sp_total_especies", ()),
    ("sp_total_observadores", ()),
    ("sp_especies_por_provincia", ("Bocas",)),
    ("sp_especies_por_provincia", ("colon",)),
    ("sp_especies_por_provincia", ("PANAMÁ OESTE",)),
    ("sp_avistamientos_por_anio", (2025,)),
    ("sp_avistamientos_por_anio", (1999,)),
    ("sp_registros_con_foto", ()),
    ("sp_especie_mas_avistada", ()),
    ("sp_familia_mas_especies", ()),
    ("sp_provincias_por_especie", ("Oophaga pumilio",)),
    ("sp_provincias_por_especie", ("rhinella",)),
    ("sp_avistamientos_agrupados_por_anio", ()),
    ("sp_provincia_mayor_diversidad", ()),
]

# Batería del plan de migración: (pregunta, SQL, valor esperado).
# El SQL es el mismo en los dos motores.
BATERIA = [
    ("Orden con más avistamientos",
     "SELECT orden, COUNT(*) AS total FROM vista_avistamiento_completo GROUP BY orden ORDER BY total DESC LIMIT 1",
     [("Anura", 8355)]),
    ("Especie más avistada",
     "SELECT nombre_cientifico, COUNT(*) AS total FROM vista_avistamiento_completo GROUP BY nombre_cientifico ORDER BY total DESC LIMIT 1",
     [("Rhinella horribilis", 1364)]),
    ("Familia con más especies",
     "SELECT f.nombre, COUNT(e.especie_id) AS cantidad FROM familia f JOIN especie e ON f.familia_id = e.familia_id GROUP BY f.nombre ORDER BY cantidad DESC LIMIT 1",
     [("Hylidae", 28)]),
    ("Avistamientos en 2025",
     "SELECT COUNT(*) FROM avistamiento WHERE anio = 2025",
     [(1925,)]),
    ("Provincia de mayor diversidad",
     "SELECT provincia, COUNT(DISTINCT especie_id) AS diversidad FROM vista_avistamiento_completo GROUP BY provincia ORDER BY diversidad DESC LIMIT 1",
     [("Panamá", 72)]),
]

# Los LIMIT 1 solo son confiables si no hay empate en el primer lugar:
# estas listas completas, con desempate por nombre, lo muestran.
RANKINGS = [
    ("Ranking de órdenes", "SELECT orden, COUNT(*) AS t FROM vista_avistamiento_completo GROUP BY orden ORDER BY t DESC, orden"),
    ("Ranking de especies", "SELECT nombre_cientifico, COUNT(*) AS t FROM vista_avistamiento_completo GROUP BY nombre_cientifico ORDER BY t DESC, nombre_cientifico"),
    ("Ranking de familias", "SELECT f.nombre, COUNT(e.especie_id) AS t FROM familia f JOIN especie e ON f.familia_id = e.familia_id GROUP BY f.nombre ORDER BY t DESC, f.nombre"),
    ("Ranking de provincias", "SELECT provincia, COUNT(DISTINCT especie_id) AS t FROM vista_avistamiento_completo GROUP BY provincia ORDER BY t DESC, provincia"),
]

FUNCIONES = [
    ("fn_temporada, meses 1 a 12 y NULL",
     "SELECT m, fn_temporada(m) FROM ({}) x ORDER BY m".format(
         " UNION ALL ".join(f"SELECT {i} AS m" for i in range(1, 13)) + " UNION ALL SELECT NULL"),
     False),
    ("fn_disponibilidad_multimedia, valores de prueba",
     "SELECT v, fn_disponibilidad_multimedia(v) FROM (SELECT 'StillImage' AS v UNION ALL SELECT 'Sound' "
     "UNION ALL SELECT 'StillImage;Sound' UNION ALL SELECT 'stillimage' UNION ALL SELECT 'SOUND' "
     "UNION ALL SELECT 'otra cosa' UNION ALL SELECT NULL) x ORDER BY v",
     False),
    ("fn_disponibilidad_multimedia sobre los datos",
     "SELECT fn_disponibilidad_multimedia(media_type) AS m, COUNT(*) FROM avistamiento GROUP BY m ORDER BY m",
     False),
    ("fn_temporada sobre los datos",
     "SELECT fn_temporada(mes) AS t, COUNT(*) AS total FROM avistamiento GROUP BY fn_temporada(mes) ORDER BY total DESC",
     False),
    ("Resultado de función comparado sin mayúsculas",
     "SELECT COUNT(*) FROM avistamiento WHERE fn_temporada(mes) = 'LLUVIOSA'",
     False),
]

# utf8mb4_unicode_ci no distingue mayúsculas ni acentos: aquí se
# comprueba que la colación de Postgres haga lo mismo.
COLACION = [
    ("LIKE sin acento ni mayúscula", "SELECT COUNT(*) FROM vista_avistamiento_completo WHERE provincia LIKE '%colon%'"),
    ("= sin acento", "SELECT DISTINCT provincia FROM vista_avistamiento_completo WHERE provincia = 'panama'"),
    ("= en mayúsculas con acento", "SELECT COUNT(*) FROM provincia WHERE nombre = 'PANAMÁ'"),
    ("IN sin acentos", "SELECT nombre FROM provincia WHERE nombre IN ('chiriqui', 'darien', 'cocle') ORDER BY nombre"),
    ("Nombre común con LIKE", "SELECT nombre_cientifico, nombre_comun FROM especie WHERE nombre_comun LIKE '%RANA%' ORDER BY nombre_cientifico"),
    ("Orden alfabético de provincias", "SELECT nombre FROM provincia ORDER BY nombre"),
    ("Orden alfabético de familias", "SELECT nombre FROM familia ORDER BY nombre"),
    ("Orden alfabético de especies", "SELECT nombre_cientifico FROM especie ORDER BY nombre_cientifico"),
    ("Valores con espacios al final (MySQL los ignora al comparar)",
     "SELECT COUNT(*) FROM vista_avistamiento_completo WHERE nombre_cientifico LIKE '% ' OR provincia LIKE '% ' OR observador LIKE '% ' OR familia LIKE '% '"),
]

INTENTOS_DE_ESCRITURA = [
    "INSERT INTO orden (nombre) VALUES ('prueba')",
    "UPDATE especie SET nombre_comun = 'x' WHERE especie_id = 1",
    "DELETE FROM avistamiento WHERE avistamiento_id = 1",
    "CREATE TABLE prueba (x int)",
    "SET TRANSACTION READ WRITE; INSERT INTO orden (nombre) VALUES ('prueba')",
]


def consultas_referencia(base):
    """Las consultas del bloque de la colección en consultas_referencia.sql."""
    texto = (RAIZ / "database" / "consultas_referencia.sql").read_text(encoding="utf-8")
    bloque = texto.split(f"USE {base};", 1)[1].split("-- ####", 1)[0]
    consultas = []
    for trozo in bloque.split(";"):
        lineas = [l for l in trozo.splitlines() if l.strip()]
        titulo = next((l.strip("- ").strip() for l in lineas if re.match(r"--\s*\d+\.", l)), None)
        sql = "\n".join(l for l in lineas if not l.strip().startswith("--")).strip()
        if sql:
            consultas.append((titulo or sql[:60], sql))
    return consultas


def normalizar(filas):
    return [tuple(v for v in f) for f in filas]


class Comparador:
    def __init__(self, my, pg):
        self.my, self.pg = my, pg
        self.lineas, self.fallos, self.total = [], 0, 0

    def log(self, texto=""):
        print(texto)
        self.lineas.append(texto)

    def seccion(self, titulo):
        self.log()
        self.log(f"== {titulo} ==")

    def mysql(self, sql):
        cur = self.my.cursor()
        cur.execute(sql)
        filas = cur.fetchall()
        cur.close()
        return normalizar(filas)

    def postgres(self, sql):
        return normalizar(self.pg.execute(sql).fetchall())

    def comparar(self, nombre, a, b, esperado=None, orden_importa=True):
        self.total += 1
        problemas = []
        if a != b:
            if not orden_importa and sorted(a, key=repr) == sorted(b, key=repr):
                pass
            elif sorted(a, key=repr) == sorted(b, key=repr):
                problemas.append("mismas filas en distinto orden")
            else:
                problemas.append(f"MySQL {len(a)} filas, Postgres {len(b)} filas")
                for i in range(max(len(a), len(b))):
                    fa = a[i] if i < len(a) else "(no hay)"
                    fb = b[i] if i < len(b) else "(no hay)"
                    if fa != fb:
                        problemas.append(f"  fila {i + 1}: MySQL {fa!r} | Postgres {fb!r}")
                        if len(problemas) > 11:
                            problemas.append("  ...")
                            break
        if esperado is not None and a != esperado:
            problemas.append(f"MySQL no da lo esperado {esperado!r}: {a!r}")
        if problemas:
            self.fallos += 1
            self.log(f"[DIFIERE] {nombre}")
            for p in problemas:
                self.log(f"    {p}")
        else:
            muestra = a if len(a) <= 3 else f"{len(a)} filas"
            self.log(f"[igual]   {nombre}: {muestra}")

    def misma_consulta(self, nombre, sql, **kw):
        self.comparar(nombre, self.mysql(sql), self.postgres(sql), **kw)


def llamar_mysql(my, proc, args):
    cur = my.cursor()
    cur.callproc(proc, args)
    filas = [f for r in cur.stored_results() for f in r.fetchall()]
    cur.close()
    return normalizar(filas)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coleccion", default="anfibios", choices=sorted(COLECCIONES))
    esquema = ap.parse_args().coleccion
    base = COLECCIONES[esquema]["mysql_db"]

    my = conectar_mysql(base)
    pg = conectar_pg("DATABASE_URL_LECTOR", autocommit=True)
    pg.execute(f"SET search_path = {esquema}, public")
    c = Comparador(my, pg)
    c.log(f"Comparación MySQL {base} contra Postgres (Neon) esquema {esquema}")

    c.seccion("1. consultas_referencia.sql")
    for titulo, sql in consultas_referencia(base):
        c.misma_consulta(titulo, sql)

    c.seccion("2. Procedimientos")
    for proc, args in PROCEDIMIENTOS:
        marcas = ", ".join(["%s"] * len(args))
        b = normalizar(pg.execute(f"SELECT * FROM {proc}({marcas})", args).fetchall())
        c.comparar(f"{proc}({', '.join(map(repr, args))})", llamar_mysql(my, proc, args), b)

    c.seccion("3. Batería de comprobación")
    if esquema == "anfibios":
        for nombre, sql, esperado in BATERIA:
            c.misma_consulta(nombre, sql, esperado=esperado)
    for nombre, sql in RANKINGS:
        a = c.mysql(sql)
        c.comparar(nombre, a, c.postgres(sql))
        if len(a) > 1 and a[0][-1] == a[1][-1]:
            c.fallos += 1
            c.log(f"[EMPATE]  {nombre}: el primer lugar está empatado; el LIMIT 1 no es confiable")

    c.seccion("4. Funciones")
    for nombre, sql, orden in FUNCIONES:
        c.misma_consulta(nombre, sql, orden_importa=orden)

    c.seccion("5. Colación (mayúsculas y acentos)")
    for nombre, sql in COLACION:
        c.misma_consulta(nombre, sql)

    c.seccion("6. Tablas y vista, fila por fila")
    for tabla in TABLAS + ["vista_avistamiento_completo"]:
        c.misma_consulta(f"conteo de {tabla}", f"SELECT COUNT(*) FROM {tabla}")
        c.misma_consulta(f"contenido de {tabla}", f"SELECT * FROM {tabla} ORDER BY 1")
    cur = my.cursor()
    cur.execute("SELECT * FROM vista_avistamiento_completo LIMIT 0")
    cur.fetchall()
    cols_my = [d[0] for d in cur.description]
    cur.close()
    cols_pg = [d.name for d in pg.execute("SELECT * FROM vista_avistamiento_completo LIMIT 0").description]
    c.comparar("columnas de la vista (nombre y orden)", [tuple(cols_my)], [tuple(cols_pg)])

    c.seccion("7. El rol de la app no puede escribir")
    for sql in INTENTOS_DE_ESCRITURA:
        c.total += 1
        try:
            pg.execute(sql)
            c.fallos += 1
            c.log(f"[DIFIERE] el lector pudo ejecutar: {sql}")
        except Exception as e:
            c.log(f"[igual]   rechazado ({type(e).__name__}): {sql}")

    c.log()
    c.log(f"Resultado: {c.total - c.fallos} de {c.total} comprobaciones iguales, {c.fallos} con diferencias.")
    salida = Path(__file__).with_name(f"comparacion_{esquema}.txt")
    salida.write_text("\n".join(c.lineas) + "\n", encoding="utf-8")
    print(f"Informe: {salida.relative_to(RAIZ)}")
    sys.exit(1 if c.fallos else 0)


if __name__ == "__main__":
    main()
