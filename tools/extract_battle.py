"""Material de la escena de combate:
- sprites animados de frente y de espalda de Pokémon Blanco/Negro (PokeAPI/sprites), pasados de GIF a hojas;
- fondos, plataformas y hojas de animación de ataques de la comunidad (repositorio de Pokémon Infinite Fusion,
  recursos de Pokémon Essentials).

  .venv/bin/python tools/extract_battle.py   ->  public/assets/battle
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageSequence

from extract_pmd import UNITS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "vendor")
OUT = os.path.join(ROOT, "public", "assets", "battle")
BW = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/"
FUSION = "https://raw.githubusercontent.com/infinitefusion/infinitefusion-e18/master/Graphics/"
COLS = 12

# escenario -> (fondo, plataforma)
ARENAS = {"field": ("field", "grass"), "forest": ("forest", "forest"), "water": ("water", "water"),
          "mountain": ("mountain", "mountain"), "city": ("city", "city")}
# nombre corto -> hoja de animación (celdas de 192x192)
SHEETS = {
    "fire": "PRAS- Fire", "water": "PRAS- Water", "grass": "PRAS- Grass", "electric": "PRAS- Electric",
    "thunder": "Thunder2", "rock": "PRAS- Rock", "rocksmash": "PRAS- Rock Smash", "slash": "PRAS- Slash",
    "crunch": "Crunch", "punches": "punches", "dragonpulse": "PRAS- Dragon Pulse", "dragonbreath": "PRAS- Dragonbreath",
    "airslash": "PRAS- Air Slash", "ironhead": "PRAS- Iron Head", "explosions": "PRAS- Explosions",
}
# fondos a pantalla completa que acompañan a algunos ataques
MOVE_BGS = {"fire": "PRAS- Fire BG", "electric": "PRAS- Thunder BG", "psychic": "PRAS- Psychic BG", "water": "PRAS- Hydro Cannon BG",
            "dragon": "PRAS- Dragon Fire BG", "steel": "PRAS- Metal Burst BG", "normal": "PRAS- Giga Impact BG",
            "fighting": "PRAS- Focus Punch BG"}


def fetch(url, rel):
    path = os.path.join(CACHE, rel)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        urllib.request.urlretrieve(url, path)
    return path


def gif_to_sheet(path, out):
    gif = Image.open(path)
    frames, durations = [], []
    for frame in ImageSequence.Iterator(gif):
        frames.append(frame.convert("RGBA"))
        durations.append(frame.info.get("duration", 60) or 60)
    w, h = gif.size
    sheet = Image.new("RGBA", (COLS * w, ((len(frames) + COLS - 1) // COLS) * h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % COLS) * w, (i // COLS) * h))
    sheet.save(out)
    return {"w": w, "h": h, "cols": COLS, "d": durations}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {"sprites": {}, "sheets": {}}
    for name, dex in UNITS.items():
        meta["sprites"][name] = {}
        for view, sub in (("front", ""), ("back", "back/")):
            gif = fetch("%s%s%d.gif" % (BW, sub, dex), "bw/%s%d.gif" % (sub, dex))
            meta["sprites"][name][view] = gif_to_sheet(gif, os.path.join(OUT, "%s-%s.png" % (name, view)))
        print(name, "ok")
    for arena, (bg, base) in ARENAS.items():
        for kind, rel in (("bg", "battlebg/" + bg), ("player", "playerbase/" + base), ("enemy", "enemybase/" + base)):
            src = fetch(FUSION + "Battlebacks/" + rel + ".png", "fusion/Battlebacks__" + rel.replace("/", "__") + ".png")
            Image.open(src).convert("RGBA").save(os.path.join(OUT, "%s-%s.png" % (arena, kind)))
    for short, name in SHEETS.items():
        src = fetch(FUSION + urllib.parse.quote("Animations/" + name + ".png"), "fusion/Animations__" + name + ".png")
        im = Image.open(src).convert("RGBA")
        im.save(os.path.join(OUT, "fx-%s.png" % short))
        meta["sheets"][short] = {"w": 192, "h": 192, "cols": im.width // 192, "n": (im.width // 192) * (im.height // 192)}
    for ptype, name in MOVE_BGS.items():
        src = fetch(FUSION + urllib.parse.quote("Animations/" + name + ".png"), "fusion/Animations__" + name + ".png")
        Image.open(src).convert("RGB").save(os.path.join(OUT, "movebg-%s.jpg" % ptype), quality=88)
    with open(os.path.join(OUT, "battle.json"), "w") as f:
        json.dump(meta, f)


if __name__ == "__main__":
    main()
