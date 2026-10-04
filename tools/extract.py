"""Extrae gráficos de la decompilación de Pokémon Esmeralda (vendor/pokeemerald)
y los deja listos para el juego en public/assets.

  .venv/bin/python tools/extract.py
"""
import json
import os
import struct
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "vendor", "pokeemerald")
OUT = os.path.join(ROOT, "public", "assets")
PREVIEW = os.path.join(ROOT, "tools", "preview")

PRIMARY = "data/tilesets/primary/general"
SECONDARY = "data/tilesets/secondary/petalburg"
PRIMARY_TILES = 512  # los tiles 0-511 son del tileset primario
PRIMARY_PALS = 6  # las paletas 0-5 son del primario, 6-12 del secundario
ATLAS_COLS = 32

# Especies que aparecen en el juego (carpeta en graphics/pokemon)
SPECIES = [
    "treecko", "torchic", "mudkip", "poochyena", "zigzagoon", "taillow",
    "wingull", "ralts", "geodude", "aron", "machop", "pikachu", "abra",
    "wailmer", "swellow", "sceptile", "blaziken", "swampert", "metagross",
    "salamence", "rayquaza", "gyarados", "snorlax", "gardevoir",
]


def read_pal(path):
    with open(path) as f:
        lines = f.read().split()
    n = int(lines[2])
    vals = list(map(int, lines[3:3 + n * 3]))
    return [tuple(vals[i * 3:i * 3 + 3]) for i in range(n)]


class Tileset:
    def __init__(self, rel):
        d = os.path.join(SRC, rel)
        self.tiles = Image.open(os.path.join(d, "tiles.png"))
        self.cols = self.tiles.width // 8
        self.px = self.tiles.load()
        self.pals = [read_pal(os.path.join(d, "palettes", "%02d.pal" % i)) for i in range(16)]
        with open(os.path.join(d, "metatiles.bin"), "rb") as f:
            raw = f.read()
        self.metatiles = [struct.unpack("<8H", raw[i:i + 16]) for i in range(0, len(raw), 16)]

    overrides = {}  # tile -> (imagen de animación, índice de tile dentro de ella)

    def tile_pixels(self, idx):
        """Índices de color (0-15) de un tile de 8x8."""
        if idx in self.overrides:
            im, t = self.overrides[idx]
            px, cols = im.load(), im.width // 8
            return [[px[(t % cols) * 8 + x, (t // cols) * 8 + y] & 15 for x in range(8)] for y in range(8)]
        tx, ty = (idx % self.cols) * 8, (idx // self.cols) * 8
        if ty >= self.tiles.height:
            return [[0] * 8 for _ in range(8)]
        return [[self.px[tx + x, ty + y] & 15 for x in range(8)] for y in range(8)]


def render_metatile(entry, primary, secondary):
    """Devuelve (capa inferior, capa superior) como imágenes RGBA de 16x16."""
    layers = []
    for layer in range(2):
        im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        out = im.load()
        for i in range(4):
            v = entry[layer * 4 + i]
            tile, hflip, vflip, pal = v & 0x3FF, v & 0x400, v & 0x800, v >> 12
            ts = primary if tile < PRIMARY_TILES else secondary
            pix = ts.tile_pixels(tile if tile < PRIMARY_TILES else tile - PRIMARY_TILES)
            colors = (primary if pal < PRIMARY_PALS else secondary).pals[pal]
            ox, oy = (i % 2) * 8, (i // 2) * 8
            for y in range(8):
                for x in range(8):
                    c = pix[7 - y if vflip else y][7 - x if hflip else x]
                    if c:
                        out[ox + x, oy + y] = colors[c] + (255,)
        layers.append(im)
    return layers


def build_atlas(name, ts, primary, secondary):
    n = len(ts.metatiles)
    rows = (n + ATLAS_COLS - 1) // ATLAS_COLS
    atlas = Image.new("RGBA", (ATLAS_COLS * 16, rows * 16), (0, 0, 0, 0))
    for i, entry in enumerate(ts.metatiles):
        bottom, top = render_metatile(entry, primary, secondary)
        pos = ((i % ATLAS_COLS) * 16, (i // ATLAS_COLS) * 16)
        atlas.alpha_composite(bottom, pos)
        atlas.alpha_composite(top, pos)
    atlas.save(os.path.join(OUT, name + ".png"))

    # Hoja de contactos con el índice de cada metatile, para elegirlos a ojo
    cols, cell = 16, 52
    sheet = Image.new("RGBA", (cols * cell, ((n + cols - 1) // cols) * cell), (40, 40, 48, 255))
    draw = ImageDraw.Draw(sheet)
    for i in range(n):
        tile = atlas.crop(((i % ATLAS_COLS) * 16, (i // ATLAS_COLS) * 16,
                           (i % ATLAS_COLS) * 16 + 16, (i // ATLAS_COLS) * 16 + 16))
        x, y = (i % cols) * cell, (i // cols) * cell
        sheet.alpha_composite(tile.resize((32, 32), Image.NEAREST), (x + 10, y + 2))
        draw.text((x + 10, y + 36), str(i), fill=(255, 255, 255, 255))
    sheet.save(os.path.join(PREVIEW, name + ".png"))


# Piezas enteras tal como aparecen en los mapas reales (Petalburgo y Ruta 102): filas de metatiles.
# Los ids >= 512 son del tileset secundario. El césped de fondo se recorta comparando con el metatile 1.
PIECES = {
    "house": [[8, 9, 9, 10], [16, 17, 17, 18], [24, 25, 11, 26], [32, 33, 19, 34]],
    "center": [[72, 73, 74, 75], [80, 81, 82, 83], [88, 89, 90, 91], [96, 97, 98, 99]],
    "mart": [[592, 593, 600, 601], [48, 49, 50, 51], [56, 57, 58, 59], [96, 65, 66, 67]],
    "gym": [[426, 427, 427, 427, 427, 428], [434, 435, 435, 435, 435, 436], [440, 441, 442, 435, 443, 444],
            [448, 449, 450, 453, 451, 452], [456, 457, 458, 461, 459, 460]],
    "tree": [[462, 463], [470, 471], [486, 487]],
    "sign": [[3]],
}
GRASS_ID = 1


def build_pieces(primary, secondary):
    atlases = [Image.open(os.path.join(OUT, n + ".png")).convert("RGBA") for n in ("tiles_general", "tiles_town")]

    def metatile(i):
        atlas, idx = (atlases[0], i) if i < 512 else (atlases[1], i - 512)
        sx, sy = (idx % ATLAS_COLS) * 16, (idx // ATLAS_COLS) * 16
        return atlas.crop((sx, sy, sx + 16, sy + 16))

    grass = metatile(GRASS_ID).load()
    meta, images = {}, []
    for name, rows in PIECES.items():
        im = Image.new("RGBA", (len(rows[0]) * 16, len(rows) * 16), (0, 0, 0, 0))
        for y, row in enumerate(rows):
            for x, i in enumerate(row):
                im.paste(metatile(i), (x * 16, y * 16))
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                if px[x, y] == grass[x % 16, y % 16]:
                    px[x, y] = (0, 0, 0, 0)
        if name == "mart":  # la fila de arriba trae restos del seto y el árbol de detrás: fuera lo verde
            for y in range(16):
                for x in range(im.width):
                    r, g, b, a = px[x, y]
                    if g > b:
                        px[x, y] = (0, 0, 0, 0)
        images.append((name, im))
    sheet = Image.new("RGBA", (sum(im.width for _, im in images), max(im.height for _, im in images)), (0, 0, 0, 0))
    x = 0
    for name, im in images:
        sheet.paste(im, (x, 0))
        meta[name] = {"x": x, "w": im.width, "h": im.height}
        x += im.width
    sheet.save(os.path.join(OUT, "pieces.png"))
    with open(os.path.join(OUT, "pieces.json"), "w") as f:
        json.dump(meta, f)

    # Flores animadas: el metatile 4 con cada fotograma de sus tiles (508-511)
    flowers = Image.new("RGBA", (48, 16), (0, 0, 0, 0))
    for k in range(3):
        anim = Image.open(os.path.join(SRC, PRIMARY, "anim", "flower", "%d.png" % k))
        primary.overrides = {508 + t: (anim, t) for t in range(4)}
        bottom, top = render_metatile(primary.metatiles[4], primary, secondary)
        bottom.alpha_composite(top)
        flowers.paste(bottom, (k * 16, 0))
    primary.overrides = {}
    flowers.save(os.path.join(OUT, "flowers.png"))


def to_rgba(path):
    """Sprite indexado -> RGBA, con el color 0 de la paleta como transparente."""
    im = Image.open(path)
    rgba = im.convert("RGBA")
    src, dst = im.load(), rgba.load()
    for y in range(im.height):
        for x in range(im.width):
            if src[x, y] == 0:
                dst[x, y] = (0, 0, 0, 0)
    return rgba


def build_pokemon():
    n = len(SPECIES)
    icons = Image.new("RGBA", (n * 32, 64), (0, 0, 0, 0))
    fronts = Image.new("RGBA", (n * 64, 64), (0, 0, 0, 0))
    backs = Image.new("RGBA", (n * 64, 64), (0, 0, 0, 0))
    for i, name in enumerate(SPECIES):
        d = os.path.join(SRC, "graphics", "pokemon", name)
        icons.alpha_composite(to_rgba(os.path.join(d, "icon.png")), (i * 32, 0))
        front = os.path.join(d, "front.png")
        if not os.path.exists(front):
            front = os.path.join(d, "anim_front.png")
        fronts.alpha_composite(to_rgba(front).crop((0, 0, 64, 64)), (i * 64, 0))
        backs.alpha_composite(to_rgba(os.path.join(d, "back.png")).crop((0, 0, 64, 64)), (i * 64, 0))
    icons.save(os.path.join(OUT, "icons.png"))
    fronts.save(os.path.join(OUT, "fronts.png"))
    backs.save(os.path.join(OUT, "backs.png"))
    with open(os.path.join(OUT, "species.json"), "w") as f:
        json.dump(SPECIES, f)


# Sprites de efectos de combate de Esmeralda: nombre -> (ancho, alto) de cada fotograma (van apilados)
FX = {
    "fire": (32, 32), "small_ember": (32, 32), "fire_plume": (32, 32), "explosion": (32, 32), "leaf": (16, 16),
    "razor_leaf": (32, 16), "cut": (32, 32), "slash": (32, 32), "claw_slash": (32, 32), "scratch": (32, 32),
    "lightning": (32, 32), "electricity": (32, 32), "shock": (32, 32), "spark_2": (16, 16), "fangs": (32, 32),
    "purple_swipe": (64, 64), "impact": (32, 32), "hit": (32, 32), "slam_hit": (32, 32), "punch_impact": (32, 32),
    "red_fist": (32, 32), "rocks": (32, 32), "flying_dirt": (32, 32), "gray_smoke": (32, 32), "bubble": (16, 16),
    "water_impact": (32, 32), "splash": (64, 64), "water_orb": (16, 16), "shadow_ball": (32, 32),
    "purple_flame": (16, 32), "confetti": (8, 8), "protect": (64, 64), "white_feather": (32, 32),
    "gold_stars": (16, 16), "blue_star": (32, 32), "sparkle_1": (32, 32), "sparkle_4": (32, 32),
    "green_sparkle": (16, 16), "eye_sparkle": (16, 16), "focus_energy": (16, 32), "thin_ring": (64, 64),
    "round_white_halo": (64, 64), "orbs": (16, 16), "wisp_fire": (32, 32),
}
# Efectos de campo (pisar hierba, ondas en el agua, polvo): nombre -> tamaño de fotograma
FIELD_FX = {"tall_grass": (16, 16), "jump_tall_grass": (16, 8), "ripple": (16, 16), "ground_impact_dust": (16, 8), "sparkle": (16, 16)}
FRAMES = [1, 13, 18]  # marcos de ventana que usa la interfaz


def build_fx():
    out = os.path.join(OUT, "fx")
    os.makedirs(out, exist_ok=True)
    meta = {}
    for name, (w, h) in FX.items():
        im = to_rgba(os.path.join(SRC, "graphics", "battle_anims", "sprites", name + ".png"))
        im.save(os.path.join(out, name + ".png"))
        meta[name] = {"w": w, "h": h, "n": im.height // h}
    for name, (w, h) in FIELD_FX.items():  # estos van en horizontal: se apilan en vertical como los demás
        src = to_rgba(os.path.join(SRC, "graphics", "field_effects", "pics", name + ".png"))
        n = src.width // w
        im = Image.new("RGBA", (w, h * n), (0, 0, 0, 0))
        for i in range(n):
            im.paste(src.crop((i * w, 0, i * w + w, h)), (0, i * h))
        im.save(os.path.join(out, name + ".png"))
        meta[name] = {"w": w, "h": h, "n": n}
    with open(os.path.join(out, "fx.json"), "w") as f:
        json.dump(meta, f)
    ui = os.path.join(OUT, "ui")
    os.makedirs(ui, exist_ok=True)
    for i in FRAMES:
        to_rgba(os.path.join(SRC, "graphics", "text_window", "%d.png" % i)).save(os.path.join(ui, "frame-%d.png" % i))


def main():
    if not os.path.isdir(SRC):
        sys.exit("Falta vendor/pokeemerald (ver README)")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    primary, secondary = Tileset(PRIMARY), Tileset(SECONDARY)
    build_atlas("tiles_general", primary, primary, secondary)
    build_atlas("tiles_town", secondary, primary, secondary)
    build_pieces(primary, secondary)
    build_pokemon()
    build_fx()
    print("ok ->", OUT)


if __name__ == "__main__":
    main()
