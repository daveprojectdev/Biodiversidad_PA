"""Genera los íconos PNG del Atlas a partir del mismo dibujo que favicon.svg.

    python -I nube/worker/scripts/iconos.py

Escribe nube/web/favicon-32.png (navegadores que no leen SVG) y
nube/web/apple-touch-icon.png (180 px, el ícono de inicio en el iPhone, con
fondo crema porque iOS no admite transparencia). Se dibuja a 8x y se reduce,
para que los bordes queden suaves.
"""
from pathlib import Path

from PIL import Image, ImageDraw

WEB = Path(__file__).resolve().parents[2] / "web"
VERDE, ROJO, NEGRO, BOCA, CREMA = "#4fbf5e", "#e3262f", "#111111", "#23602f", "#f7f6f1"


def rana(tamano, fondo=None, margen=0.0):
    escala = 8
    lado = tamano * escala
    img = Image.new("RGBA", (lado, lado), fondo or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    util = lado * (1 - 2 * margen)
    k = util / 32  # el dibujo está en un lienzo de 32 x 32
    o = lado * margen

    def p(x, y):
        return (o + x * k, o + y * k)

    def elipse(cx, cy, rx, ry, color):
        d.ellipse([p(cx - rx, cy - ry), p(cx + rx, cy + ry)], fill=color)

    elipse(16, 20, 14.5, 10.5, VERDE)
    for cx in (8.6, 23.4):
        elipse(cx, 10.4, 6.6, 6.6, VERDE)
        elipse(cx, 10.4, 4.7, 4.7, ROJO)
        elipse(cx, 10.4, 1.3, 3.4, NEGRO)
    # La sonrisa: un arco de la curva Q del SVG, aproximado con un arco de elipse.
    d.arc([p(9.5, 15.5), p(22.5, 25.4)], start=30, end=150, fill=BOCA, width=max(1, round(2 * k)))
    return img.resize((tamano, tamano), Image.LANCZOS)


rana(32).save(WEB / "favicon-32.png")
rana(180, fondo=CREMA, margen=0.12).convert("RGB").save(WEB / "apple-touch-icon.png")
print("Íconos: favicon-32.png y apple-touch-icon.png")
