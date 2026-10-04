"""Genera fuentes web (WOFF2) con las letras originales de Pokémon Esmeralda a partir de sus hojas de glifos.

  .venv/bin/python tools/make_font.py   ->  public/fonts/emerald.woff2, emerald-small.woff2
"""
import os
import re
import subprocess

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "vendor", "pokeemerald")
OUT = os.path.join(ROOT, "public", "fonts")
PX = 64  # unidades de fuente por píxel: la celda de 16 px es un em de 1024
BASELINE = 13  # fila de la celda donde apoyan las letras
# Caracteres que el juego no tiene y se resuelven con uno parecido
ALIASES = {"₽": "¥", "«": "“", "»": "”", "−": "-", "–": "-", "—": "-", " ": " ", "'": "’", '"': "”"}


def git_show(path):
    return subprocess.run(["git", "-C", SRC, "show", "HEAD:" + path], capture_output=True, text=True, check=True).stdout


def charmap():
    chars = {}
    for line in git_show("charmap.txt").splitlines():
        m = re.match(r"^'(\\?.)'\s*=\s*([0-9A-F]{2})\s*$", line)
        if m:
            ch = m.group(1)
            chars.setdefault("'" if ch == "\\'" else ch[-1], int(m.group(2), 16))
    return chars


def widths(name):
    body = re.search(name + r"\[\] = \{(.*?)\};", git_show("src/fonts.c"), re.S).group(1)
    return [int(n) for n in re.findall(r"\d+", body)]


def build(sheet, width_table, family, filename):
    im = Image.open(os.path.join(SRC, "graphics", "fonts", sheet + ".png"))
    px = im.load()
    chars, adv = charmap(), widths(width_table)
    for alias, target in ALIASES.items():
        if target in chars:
            chars.setdefault(alias, chars[target])
    glyph_order, cmap, glyphs, metrics = [".notdef"], {}, {}, {}
    pen = TTGlyphPen(None)
    glyphs[".notdef"] = pen.glyph()
    metrics[".notdef"] = (6 * PX, 0)
    for ch, code in sorted(chars.items()):
        name = "g%02X" % code
        cmap[ord(ch)] = name
        if name in glyphs:
            continue
        gx, gy = (code % 16) * 16, (code // 16) * 16
        pen = TTGlyphPen(None)
        for y in range(16):  # un rectángulo por cada tira horizontal de píxeles de tinta
            x = 0
            while x < 16:
                if px[gx + x, gy + y] != 1:
                    x += 1
                    continue
                start = x
                while x < 16 and px[gx + x, gy + y] == 1:
                    x += 1
                top, bottom = (BASELINE - y) * PX, (BASELINE - y - 1) * PX
                pen.moveTo((start * PX, bottom))
                pen.lineTo((start * PX, top))
                pen.lineTo((x * PX, top))
                pen.lineTo((x * PX, bottom))
                pen.closePath()
        glyphs[name] = pen.glyph()
        metrics[name] = (adv[code] * PX, 0)
        glyph_order.append(name)
    fb = FontBuilder(16 * PX, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=BASELINE * PX, descent=-(16 - BASELINE) * PX)
    fb.setupNameTable({"familyName": family, "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=BASELINE * PX, sTypoDescender=-(16 - BASELINE) * PX, usWinAscent=BASELINE * PX, usWinDescent=(16 - BASELINE) * PX)
    fb.setupPost()
    fb.font.flavor = "woff2"
    os.makedirs(OUT, exist_ok=True)
    fb.save(os.path.join(OUT, filename))
    print(family, len(glyph_order), "glifos ->", filename)


if __name__ == "__main__":
    build("latin_normal", "gFontNormalLatinGlyphWidths", "Emerald", "emerald.woff2")
    build("latin_small", "gFontSmallLatinGlyphWidths", "Emerald Small", "emerald-small.woff2")
    build("latin_short", "gFontShortLatinGlyphWidths", "Emerald Short", "emerald-short.woff2")
