"""Genera nube/web/mapa-panama.svg desde los límites de geoBoundaries.

    python -I nube/worker/scripts/generar_mapa.py <geoBoundaries-PAN-ADM1_simplified.geojson>

Fuente: geoBoundaries gbOpen PAN ADM1 (2017, OpenStreetMap), licencia ODbL 1.0:
https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/PAN/ADM1/geoBoundaries-PAN-ADM1_simplified.geojson
La página debe decir «© colaboradores de OpenStreetMap». El GeoJSON no se sube
al repo: se descarga aparte y se pasa por argumento.

Cada provincia sale como un <path> con data-provincia igual al nombre que usa
la base (columna provincia.nombre), y data-alias con otros nombres que la
base usa para el mismo lugar (Kuna Yala y San Blas son la actual Guna Yala).
"""
import json
import math
import sys
from pathlib import Path

NOMBRES = {
    "Provincia de Bocas del Toro": ("Bocas del Toro", []),
    "Colón Province": ("Colón", []),
    "Provincia de Darién": ("Darién", []),
    "Comarca Emberá-Wounaan": ("Emberá", []),
    "Comarca Guna Yala": ("Guna Yala", ["Kuna Yala", "San Blas"]),
    "Provincia de Herrera": ("Herrera", []),
    "Provincia de Los Santos": ("Los Santos", []),
    "Comarca Ngäbe-Buglé": ("Ngöbe Buglé", []),
    "Provincia de Panamá Oeste": ("Panamá Oeste", []),
    "Provincia de Panamá": ("Panamá", []),
    "Provincia de Veraguas": ("Veraguas", []),
    "Provincia de Chiriquí": ("Chiriquí", []),
    "Provincia de Coclé": ("Coclé", []),
}

ANCHO = 1000  # unidades del viewBox
TOLERANCIA = 0.9  # simplificación, en unidades del viewBox
AREA_MINIMA = 6.0  # islotes más chicos que esto no se dibujan


def rdp(puntos, tol):
    """Douglas-Peucker sobre una lista de (x, y)."""
    if len(puntos) < 3:
        return puntos
    (x1, y1), (x2, y2) = puntos[0], puntos[-1]
    dx, dy = x2 - x1, y2 - y1
    largo = math.hypot(dx, dy)
    peor, indice = 0.0, 0
    for i in range(1, len(puntos) - 1):
        x, y = puntos[i]
        # En un anillo cerrado el primer y el último punto coinciden: se mide
        # la distancia a ese punto en vez de a una recta que no existe.
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / largo if largo else math.hypot(x - x1, y - y1)
        if d > peor:
            peor, indice = d, i
    if peor <= tol:
        return [puntos[0], puntos[-1]]
    return rdp(puntos[: indice + 1], tol)[:-1] + rdp(puntos[indice:], tol)


def area(anillo):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(anillo, anillo[1:] + anillo[:1]))) / 2


def centroide(anillo):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(anillo, anillo[1:] + anillo[:1]):
        c = x1 * y2 - x2 * y1
        a += c
        cx += (x1 + x2) * c
        cy += (y1 + y2) * c
    a /= 2
    return (cx / (6 * a), cy / (6 * a)) if a else anillo[0]


def main():
    datos = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    poligonos = []
    for f in datos["features"]:
        g = f["geometry"]
        partes = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        poligonos.append((f["properties"]["shapeName"], [p[0] for p in partes]))  # solo el anillo exterior

    todos = [pt for _, anillos in poligonos for anillo in anillos for pt in anillo]
    lon0, lon1 = min(p[0] for p in todos), max(p[0] for p in todos)
    lat0, lat1 = min(p[1] for p in todos), max(p[1] for p in todos)
    coslat = math.cos(math.radians((lat0 + lat1) / 2))
    escala = ANCHO / ((lon1 - lon0) * coslat)
    alto = (lat1 - lat0) * escala

    def proyectar(lon, lat):
        return ((lon - lon0) * coslat * escala, (lat1 - lat) * escala)

    caminos = []
    for nombre_fuente, anillos in poligonos:
        nombre, alias = NOMBRES[nombre_fuente]
        trazos, mayor = [], None
        for anillo in anillos:
            pts = [proyectar(lon, lat) for lon, lat in anillo]
            if area(pts) < AREA_MINIMA:
                continue
            simple = rdp(pts, TOLERANCIA)
            if len(simple) < 4:
                continue
            if mayor is None or area(pts) > area(mayor):
                mayor = pts
            trazos.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in simple[:-1]) + "Z")
        if mayor is None:
            raise SystemExit(f"{nombre}: ningún polígono pasó el filtro ({len(anillos)} anillos)")
        cx, cy = centroide(mayor)
        alias_attr = f' data-alias="{"|".join(alias)}"' if alias else ""
        caminos.append(
            f'  <path data-provincia="{nombre}"{alias_attr} data-cx="{cx:.0f}" data-cy="{cy:.0f}" d="{"".join(trazos)}"/>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ANCHO} {alto:.0f}" role="img" '
        f'aria-label="Mapa de Panamá por provincias y comarcas">\n'
        "  <!-- Generado por nube/worker/scripts/generar_mapa.py. Límites: geoBoundaries (2017),"
        " © colaboradores de OpenStreetMap, ODbL 1.0. -->\n" + "\n".join(caminos) + "\n</svg>\n"
    )
    salida = Path(__file__).resolve().parents[2] / "web" / "mapa-panama.svg"
    salida.parent.mkdir(exist_ok=True)
    salida.write_text(svg, encoding="utf-8")
    print(f"{salida} · {len(svg) / 1024:.0f} KB · {len(caminos)} divisiones")


if __name__ == "__main__":
    main()
