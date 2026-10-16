"""Las 10 preguntas de la rúbrica, por el Worker, contra el SQL de referencia.

    python nube/worker/scripts/validar_rubrica.py                 # las dos colecciones
    python nube/worker/scripts/validar_rubrica.py --coleccion aves
    python nube/worker/scripts/validar_rubrica.py --url https://...

Cada pregunta va en lenguaje natural a POST /consultar (con `wrangler dev`
corriendo, por defecto en http://localhost:8787). La respuesta se compara
con el SQL escrito a mano de database/consultas_referencia.sql, corrido en
Neon (que ya se comprobó igual a MySQL con nube/db/comparar.py).

Cómo se compara: el modelo puede nombrar distinto las columnas o agregar
alguna (occurrence_url, un conteo), así que una fila de referencia
coincide con una fila del Worker si todos sus valores aparecen en ella. Si
el modelo puso un LIMIT menor que el total (la regla «LIMIT 10 por
defecto» del prompt), se exigen las primeras filas de la referencia.
Escribe un informe por colección en nube/worker/validacion_<coleccion>.txt.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "db"))
from comun import RAIZ, conectar_pg  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

PREGUNTAS = [
    "¿Cuántas especies hay registradas?",
    "¿Cuántos observadores hay?",
    "¿Qué especies se vieron en Bocas del Toro?",
    "¿Cuántos avistamientos hubo en 2025?",
    "¿Cuántos registros tienen foto disponible?",
    "¿Cuál es la especie más avistada?",
    "¿Qué familia tiene más especies?",
    "¿En qué provincias se ha visto {especie}?",
    "¿Cuántos avistamientos hubo por año?",
    "¿Qué provincia tiene mayor diversidad de especies?",
]
# La #8 de aves en consultas_referencia.sql dice REEMPLAZAR_CON_ESPECIE_REAL:
# se usa la más avistada, como indica el propio archivo.
ESPECIE_8 = {"anfibios": "Oophaga pumilio", "aves": "Tyrannus melancholicus"}
BASE_MYSQL = {"anfibios": "biodiversidad_panama", "aves": "biodiversidad_aves"}
COLECCION_API = {"anfibios": "amphibia", "aves": "aves"}
COLUMNAS_EXTRA = {"occurrence_url", "media_type"}


def referencia(coleccion):
    texto = (RAIZ / "database" / "consultas_referencia.sql").read_text(encoding="utf-8")
    bloque = texto.split(f"USE {BASE_MYSQL[coleccion]};", 1)[1].split("-- ####", 1)[0]
    consultas = []
    for trozo in bloque.split(";"):
        sql = "\n".join(l for l in trozo.splitlines() if l.strip() and not l.strip().startswith("--")).strip()
        if sql:
            consultas.append(sql.replace("REEMPLAZAR_CON_ESPECIE_REAL", ESPECIE_8[coleccion]))
    assert len(consultas) == 10, len(consultas)
    return consultas


def norm(v):
    if isinstance(v, (int, float, Decimal)) and not isinstance(v, bool):
        return format(Decimal(str(v)).normalize(), "f")
    return str(v)


def comparar(ref, filas, sql_worker):
    filas_valores = [{norm(v) for k, v in f.items() if k not in COLUMNAS_EXTRA and v is not None} for f in filas]
    m = re.search(r"\bLIMIT\s+(\d+)\s*;?\s*$", sql_worker or "", re.I)
    limite = int(m.group(1)) if m else None
    if limite is not None and limite < len(ref):
        # Con ORDER BY, las primeras filas de la referencia; sin él, Postgres
        # puede devolver cualesquiera, y basta con que estén en la referencia.
        nota = f" (limitado a {limite} de {len(ref)} por el LIMIT del modelo)"
        if len(filas) != limite:
            return False, f"{len(filas)} filas, se esperaban {limite}{nota}"
        if re.search(r"\bORDER\s+BY\b", sql_worker, re.I):
            return emparejar(ref[:limite], filas_valores, nota)
        refs = [{norm(v) for v in r} for r in ref]
        for i, fv in enumerate(filas_valores):
            if not any(rv <= fv for rv in refs):
                return False, f"la fila {filas[i]!r} no está en la referencia{nota}"
        return True, f"{limite} filas, todas en la referencia{nota}"
    if len(filas) != len(ref):
        return False, f"{len(filas)} filas, la referencia tiene {len(ref)}"
    return emparejar(ref, filas_valores, "")


def emparejar(esperadas, filas_valores, nota):
    libres = list(range(len(filas_valores)))
    for r in esperadas:
        valores = {norm(v) for v in r}
        hallada = next((i for i in libres if valores <= filas_valores[i]), None)
        if hallada is None:
            return False, f"no aparece la fila de referencia {r!r}{nota}"
        libres.remove(hallada)
    return True, f"{len(esperadas)} filas{nota}"


def preguntar(url, coleccion, pregunta):
    datos = json.dumps({"pregunta": pregunta, "coleccion": COLECCION_API[coleccion]}).encode()
    pedido = urllib.request.Request(f"{url}/consultar", data=datos, headers={"Content-Type": "application/json"})
    for intento in range(3):
        try:
            with urllib.request.urlopen(pedido, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            cuerpo = json.load(e)
            if e.code == 429 and intento < 2:
                time.sleep(int(e.headers.get("Retry-After", "30")) + 1)
                continue
            return cuerpo | {"http": e.code}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coleccion", choices=["anfibios", "aves"])
    ap.add_argument("--url", default="http://localhost:8787")
    ap.add_argument("--pausa", type=float, default=8.0, help="segundos entre preguntas (cuota de Groq)")
    args = ap.parse_args()
    colecciones = [args.coleccion] if args.coleccion else ["anfibios", "aves"]

    lineas, fallos, total = [], 0, 0

    def log(t=""):
        print(t)
        lineas.append(t)

    pg = conectar_pg("DATABASE_URL_LECTOR", autocommit=True)
    for coleccion in colecciones:
        lineas.clear()
        fallos_antes, total_antes = fallos, total
        pg.execute(f"SET search_path = {coleccion}, public")
        log(f"== {coleccion} ==")
        for n, (pregunta, sql_ref) in enumerate(zip(PREGUNTAS, referencia(coleccion)), 1):
            pregunta = pregunta.format(especie=ESPECIE_8[coleccion])
            ref = [tuple(f) for f in pg.execute(sql_ref).fetchall()]
            r = preguntar(args.url, coleccion, pregunta)
            total += 1
            if "filas" not in r:
                fallos += 1
                log(f"[FALLA]  {n}. {pregunta}\n         error: {r.get('error')}\n         SQL: {r.get('sql')}")
            else:
                ok, detalle = comparar(ref, r["filas"], r.get("sql_ejecutado"))
                fallos += not ok
                log(f"[{'igual' if ok else 'FALLA'}]  {n}. {pregunta} — {detalle} — {r.get('proveedor_llm')}")
                log(f"         SQL: {r.get('sql_ejecutado')}")
                if not ok:
                    log(f"         Worker: {r['filas'][:5]}\n         Referencia: {ref[:5]}")
            time.sleep(args.pausa)
        n_total, n_fallos = total - total_antes, fallos - fallos_antes
        log(f"Resultado: {n_total - n_fallos} de {n_total} preguntas con la misma respuesta que la referencia.")
        salida = Path(__file__).resolve().parents[1] / f"validacion_{coleccion}.txt"
        salida.write_text("\n".join(lineas) + "\n", encoding="utf-8")
        log()
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
