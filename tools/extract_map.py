"""Piezas del mapa con estilo de 4ª generación (HeartGold/SoulSilver), de un tileset de la comunidad
(recursos de Pokémon Essentials tomados del repositorio de Pokémon Infinite Fusion).

  .venv/bin/python tools/extract_map.py   ->  public/assets/map/{atlas.png, atlas.json, water.png}
"""
import json
import os
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "vendor", "fusion")
OUT = os.path.join(ROOT, "public", "assets", "map")
BASE = "https://raw.githubusercontent.com/infinitefusion/infinitefusion-e18/master/Graphics/"

# nombre -> (columna, fila, columnas, filas) en tiles de 16 px del tileset; `trim` recorta lo transparente
PIECES = {
    "center": (3, 203, 5, 6), "mart": (0, 232, 5, 5), "house": (0, 237, 5, 5), "gym": (0, 912, 8, 8),
    "tree": (2, 1076, 2, 3), "rock": (0, 114, 2, 2), "stone": (2, 10, 2, 2),
}
TILES = {
    "grass": (0, 20, 4, 4), "tall": (4, 103, 1, 1), "tufts": (2, 102, 2, 1),
    "flowers": (0, 107, 4, 3),  # tres colores (filas), cuatro fotogramas cada uno
    "path": (3, 1081, 3, 3), "pathInner": (6, 1081, 2, 2),
}
WATER = "Autotiles/ocean-SHORE.png"  # autotile animado de RPG Maker XP: 32 fotogramas de 96x128


def fetch(rel):
    path = os.path.join(CACHE, rel.replace("/", "__"))
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        urllib.request.urlretrieve(BASE + urllib.parse.quote(rel), path)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    tileset = Image.open(fetch("Tilesets/Outdoor_new.png")).convert("RGBA")
    crops = []
    for name, (c, r, w, h) in {**PIECES, **TILES}.items():
        crop = tileset.crop((c * 16, r * 16, (c + w) * 16, (r + h) * 16))
        if name in PIECES:
            crop = crop.crop(crop.getbbox())
        crops.append((name, crop))
    atlas = Image.new("RGBA", (sum(c.width for _, c in crops), max(c.height for _, c in crops)), (0, 0, 0, 0))
    meta, x = {}, 0
    for name, crop in crops:
        atlas.paste(crop, (x, 0))
        meta[name] = {"x": x, "w": crop.width, "h": crop.height}
        x += crop.width
    atlas.save(os.path.join(OUT, "atlas.png"))
    with open(os.path.join(OUT, "atlas.json"), "w") as f:
        json.dump(meta, f)
    water = Image.open(fetch(WATER)).convert("RGBA")
    water.resize((water.width // 2, water.height // 2), Image.NEAREST).save(os.path.join(OUT, "water.png"))
    print(meta, water.size)


if __name__ == "__main__":
    main()
