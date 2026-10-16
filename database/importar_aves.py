"""
importar_aves.py — Importar dataset Aves a MySQL (biodiversidad_aves)
Sistema de Biodiversidad de Panamá
Autores: David Ameth Martínez Sánchez | Emanuel Quintero
Fuente: GBIF CC BY-NC 4.0 | Aves | Panamá | 2024-2026

CORREGIDO: las sentencias DDL ya NO se separan cortando por ';' —
ese enfoque rompía el CHECK de media_type porque el valor
'StillImage;Sound' contiene un punto y coma dentro del propio dato.
Ahora cada sentencia vive como un elemento separado de una lista.
"""

import os
import sys
import pandas as pd
import mysql.connector
from mysql.connector import Error as MySQLError
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", ".env"))

# ============================================================
# CONFIGURACIÓN — la contraseña sale de DB_PASS en app/.env, como en la app
# ============================================================
DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "biodiv_app",
    "password": os.getenv("DB_PASS"),
    "charset": "utf8mb4",
}
DB_NAME = "biodiversidad_aves"
CSV_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aves_refinado")

# ============================================================
# DDL — cada sentencia es un elemento independiente de la lista,
# NUNCA se parte por ';' así que los valores con ';' dentro
# (como 'StillImage;Sound') no rompen nada.
# ============================================================
DDL_STATEMENTS = [
    f"""CREATE DATABASE IF NOT EXISTS {DB_NAME}
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci""",

    """CREATE TABLE IF NOT EXISTS orden (
        orden_id    INT             NOT NULL,
        nombre      VARCHAR(50)     NOT NULL,
        CONSTRAINT pk_orden PRIMARY KEY (orden_id),
        CONSTRAINT uq_orden_nombre UNIQUE (nombre)
    ) ENGINE=InnoDB""",

    """CREATE TABLE IF NOT EXISTS familia (
        familia_id  INT             NOT NULL,
        nombre      VARCHAR(50)     NOT NULL,
        orden_id    INT             NOT NULL,
        CONSTRAINT pk_familia PRIMARY KEY (familia_id),
        CONSTRAINT uq_familia_nombre UNIQUE (nombre),
        CONSTRAINT fk_familia_orden FOREIGN KEY (orden_id)
            REFERENCES orden (orden_id)
            ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB""",

    """CREATE TABLE IF NOT EXISTS especie (
        especie_id          INT             NOT NULL,
        nombre_cientifico   VARCHAR(150)    NOT NULL,
        genero               VARCHAR(50)     NOT NULL,
        familia_id           INT             NOT NULL,
        CONSTRAINT pk_especie PRIMARY KEY (especie_id),
        CONSTRAINT uq_especie_nombre_cientifico UNIQUE (nombre_cientifico),
        CONSTRAINT fk_especie_familia FOREIGN KEY (familia_id)
            REFERENCES familia (familia_id)
            ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB""",

    """CREATE TABLE IF NOT EXISTS provincia (
        provincia_id    INT             NOT NULL,
        nombre          VARCHAR(50)     NOT NULL,
        CONSTRAINT pk_provincia PRIMARY KEY (provincia_id),
        CONSTRAINT uq_provincia_nombre UNIQUE (nombre)
    ) ENGINE=InnoDB""",

    """CREATE TABLE IF NOT EXISTS observador (
        observador_id   INT             NOT NULL,
        nombre          VARCHAR(100)    NOT NULL,
        CONSTRAINT pk_observador PRIMARY KEY (observador_id)
    ) ENGINE=InnoDB""",

    "CREATE INDEX idx_observador_nombre ON observador (nombre)",

    """CREATE TABLE IF NOT EXISTS fuente (
        fuente_id   INT             NOT NULL,
        nombre      VARCHAR(100)    NOT NULL,
        url         VARCHAR(255)    NULL,
        licencia    VARCHAR(30)     NULL,
        descripcion VARCHAR(255)    NULL,
        CONSTRAINT pk_fuente PRIMARY KEY (fuente_id),
        CONSTRAINT uq_fuente_nombre UNIQUE (nombre)
    ) ENGINE=InnoDB""",

    """CREATE TABLE IF NOT EXISTS avistamiento (
        avistamiento_id INT             NOT NULL,
        gbif_id         BIGINT          NOT NULL,
        especie_id      INT             NOT NULL,
        provincia_id    INT             NOT NULL,
        observador_id   INT             NOT NULL,
        fuente_id       INT             NOT NULL,
        latitud         DECIMAL(9,6)    NOT NULL,
        longitud        DECIMAL(9,6)    NOT NULL,
        fecha           DATE            NOT NULL,
        mes             TINYINT         NOT NULL,
        anio            SMALLINT        NOT NULL,
        licencia        VARCHAR(20)     NOT NULL,
        occurrence_url  VARCHAR(100)    NULL,
        media_type      VARCHAR(20)     NULL,
        CONSTRAINT pk_avistamiento PRIMARY KEY (avistamiento_id),
        CONSTRAINT uq_avistamiento_gbif_id UNIQUE (gbif_id),
        CONSTRAINT fk_avist_especie FOREIGN KEY (especie_id)
            REFERENCES especie (especie_id)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_avist_provincia FOREIGN KEY (provincia_id)
            REFERENCES provincia (provincia_id)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_avist_observador FOREIGN KEY (observador_id)
            REFERENCES observador (observador_id)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_avist_fuente FOREIGN KEY (fuente_id)
            REFERENCES fuente (fuente_id)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT chk_mes CHECK (mes BETWEEN 1 AND 12),
        CONSTRAINT chk_anio CHECK (anio BETWEEN 2000 AND 2100),
        CONSTRAINT chk_latitud CHECK (latitud BETWEEN -90 AND 90),
        CONSTRAINT chk_longitud CHECK (longitud BETWEEN -180 AND 180),
        CONSTRAINT chk_licencia CHECK (licencia IN ('CC_BY_NC_4_0', 'CC_BY_4_0', 'CC0_1_0')),
        CONSTRAINT chk_media_type CHECK (media_type IN ('StillImage', 'Sound', 'StillImage;Sound') OR media_type IS NULL)
    ) ENGINE=InnoDB""",

    "CREATE INDEX idx_avist_especie ON avistamiento (especie_id)",
    "CREATE INDEX idx_avist_provincia ON avistamiento (provincia_id)",
    "CREATE INDEX idx_avist_anio_mes ON avistamiento (anio, mes)",
    "CREATE INDEX idx_avist_media ON avistamiento (media_type)",
]

# ============================================================
# ORDEN DE IMPORTACIÓN — respeta las dependencias de FK
# ============================================================
TABLAS_EN_ORDEN = [
    ("orden",        "orden.csv",        ["orden_id", "nombre"]),
    ("familia",       "familia.csv",      ["familia_id", "nombre", "orden_id"]),
    ("especie",       "especie.csv",      ["especie_id", "nombre_cientifico", "genero", "familia_id"]),
    ("provincia",     "provincia.csv",    ["provincia_id", "nombre"]),
    ("observador",    "observador.csv",   ["observador_id", "nombre"]),
    ("fuente",        "fuente.csv",       ["fuente_id", "nombre", "url", "licencia", "descripcion"]),
    ("avistamiento",  "avistamiento.csv", [
        "avistamiento_id", "gbif_id", "especie_id", "provincia_id",
        "observador_id", "fuente_id", "latitud", "longitud", "fecha",
        "mes", "anio", "licencia", "occurrence_url", "media_type",
    ]),
]

BATCH_SIZE = 2000


def crear_esquema(cursor):
    print("Creando base de datos y tablas...")
    for i, stmt in enumerate(DDL_STATEMENTS):
        try:
            cursor.execute(stmt)
            # Justo después de crear la BD, seleccionarla — si no,
            # las siguientes sentencias CREATE TABLE fallan con
            # "No database selected".
            if i == 0:
                cursor.execute(f"USE {DB_NAME}")
        except MySQLError as e:
            # Índice/tabla ya existente en una corrida anterior -> continuar
            if e.errno in (1061, 1050):  # duplicate key name / table exists
                continue
            raise
    print("  Esquema listo.")


def importar_tabla(cursor, conn, tabla, archivo_csv, columnas):
    ruta = os.path.join(CSV_DIR, archivo_csv)
    if not os.path.exists(ruta):
        print(f"  ⚠ No se encontró {ruta}, se omite.")
        return 0

    df = pd.read_csv(ruta)
    # Forzar dtype=object ANTES de reemplazar NaN por None.
    # Si no se hace así, pandas revierte None -> NaN en columnas
    # numéricas, y ese NaN viaja al SQL como texto "nan" sin comillas,
    # que MySQL interpreta como un nombre de columna inexistente.
    df = df[columnas].astype(object)
    df = df.where(pd.notnull(df), None)

    placeholders = ", ".join(["%s"] * len(columnas))
    columnas_sql = ", ".join(columnas)
    sql = f"INSERT INTO {tabla} ({columnas_sql}) VALUES ({placeholders})"

    filas = [tuple(row) for row in df.itertuples(index=False, name=None)]
    total = len(filas)

    for i in range(0, total, BATCH_SIZE):
        lote = filas[i:i + BATCH_SIZE]
        cursor.executemany(sql, lote)
        conn.commit()
        print(f"  {tabla}: {min(i + BATCH_SIZE, total):,}/{total:,}")

    return total


def importar():
    print(f"Conectando a MySQL como '{DB_CONFIG['user']}'...")
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    crear_esquema(cursor)
    conn.commit()

    cursor.execute(f"USE {DB_NAME}")

    resumen = {}
    for tabla, archivo, columnas in TABLAS_EN_ORDEN:
        print(f"\nImportando {archivo} -> {tabla}...")
        n = importar_tabla(cursor, conn, tabla, archivo, columnas)
        resumen[tabla] = n

    cursor.close()
    conn.close()

    print("\n✅ Importación completa\n")
    print("Resumen:")
    for tabla, n in resumen.items():
        print(f"  {tabla:<15}: {n:>7,}")


if __name__ == "__main__":
    try:
        importar()
    except MySQLError as e:
        print(f"\n❌ Error de MySQL: {e}")
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"\n❌ Archivo no encontrado: {e}")
        sys.exit(1)
