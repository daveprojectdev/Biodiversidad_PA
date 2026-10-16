"""Conexiones y configuración compartidas por migrar.py y comparar.py.

Las credenciales salen de dos archivos que nunca se suben:
  app/.env   -> MySQL local (DB_HOST, DB_PORT, DB_USER, DB_PASS)
  nube/.env  -> Neon (DATABASE_URL_OWNER, DATABASE_URL_LECTOR)
"""
from pathlib import Path

import mysql.connector
import psycopg
from dotenv import dotenv_values

RAIZ = Path(__file__).resolve().parents[2]
ENV_APP = RAIZ / "app" / ".env"
ENV_NUBE = RAIZ / "nube" / ".env"
SQL_DIR = Path(__file__).resolve().parent / "sql"

# Una colección = una base en MySQL = un esquema en Postgres.
# Las tablas van en orden de carga (padres antes que hijos).
TABLAS = ["orden", "familia", "provincia", "fuente", "observador", "especie", "avistamiento"]

COLECCIONES = {
    "anfibios": {
        "mysql_db": "biodiversidad_panama",
        "comentarios": {
            "avistamiento": "Registros reales de avistamientos de anfibios en Panama (GBIF 2020-2026)",
            "especie": "Especies de anfibios registradas en Panama (GBIF)",
            "familia": "Familias taxonomicas de anfibios en Panama",
            "fuente": "Fuentes de datos: iNaturalist, GBIF, etc.",
            "observador": "Observadores ciudadanos que registraron los avistamientos",
            "orden": "Ordenes taxonomicos de Amphibia presentes en Panama",
            "provincia": "Provincias y comarcas de Panama con registros de anfibios",
        },
    },
    # "aves": {"mysql_db": "biodiversidad_aves", "comentarios": {...}},  # fase siguiente
}


def env_app():
    return dotenv_values(ENV_APP)


def env_nube():
    return dotenv_values(ENV_NUBE)


def conectar_mysql(base):
    e = env_app()
    return mysql.connector.connect(
        host=e.get("DB_HOST") or "localhost",
        port=int(e.get("DB_PORT") or 3306),
        user=e.get("DB_USER") or "biodiv_app",
        password=e["DB_PASS"],
        database=base,
        charset="utf8mb4",
        collation="utf8mb4_unicode_ci",
    )


def conectar_pg(clave="DATABASE_URL_OWNER", **kw):
    url = env_nube().get(clave)
    if not url:
        raise SystemExit(f"Falta {clave} en nube/.env")
    return psycopg.connect(url, **kw)


def leer_sql(nombre, esquema):
    return (SQL_DIR / nombre).read_text(encoding="utf-8").replace("{{esquema}}", esquema)
