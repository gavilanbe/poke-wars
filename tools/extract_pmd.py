"""Descarga sprites animados y retratos de Pokémon Mundo Misterioso (PMDCollab/SpriteCollab)
y los deja en public/assets/pmd. Lo descargado se guarda en vendor/pmd para no repetirlo.

  .venv/bin/python tools/extract_pmd.py
"""
import json
import os
import shutil
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "vendor", "pmd")
OUT = os.path.join(ROOT, "public", "assets", "pmd")
BASE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/"

# Unidades del juego: especie -> número de la Pokédex
UNITS = {
    "treecko": 252, "torchic": 255, "mudkip": 258, "zigzagoon": 263, "poochyena": 261, "machop": 66,
    "geodude": 74, "taillow": 276, "pikachu": 25, "ralts": 280, "wailmer": 320, "snorlax": 143,
    "metagross": 376, "salamence": 373, "sceptile": 254, "blaziken": 257, "swampert": 260,
    "swellow": 277, "gardevoir": 282,
}
# Comandantes: solo retratos, con varias caras
COMMANDERS = {"pikachu": 25, "charizard": 6, "blastoise": 9, "gengar": 94}
ANIMS = ["Idle", "Walk", "Attack", "Hurt", "Charge", "Shoot", "Swing", "Hop", "Rotate"]
FACES = ["Normal", "Happy", "Pain", "Determined", "Angry"]


def fetch(rel):
    """Devuelve la ruta local del archivo, o None si no existe en el repositorio."""
    path = os.path.join(CACHE, rel)
    if os.path.exists(path):
        return path
    if os.path.exists(path + ".missing"):
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        urllib.request.urlretrieve(BASE + rel, path)
    except urllib.error.HTTPError:
        open(path + ".missing", "w").close()
        return None
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name, dex in UNITS.items():
        folder = "sprite/%04d/" % dex
        tree = ET.parse(fetch(folder + "AnimData.xml"))
        anims = {a.findtext("Name"): a for a in tree.getroot().iter("Anim")}
        meta[name] = {}
        for anim in ANIMS:
            node = anims[anim]
            if node.find("CopyOf") is not None:  # p. ej. Attack copia de Strike
                node = anims[node.findtext("CopyOf")]
            src = fetch(folder + node.findtext("Name") + "-Anim.png")
            shutil.copy(src, os.path.join(OUT, "%s-%s.png" % (name, anim)))
            meta[name][anim] = {
                "w": int(node.findtext("FrameWidth")),
                "h": int(node.findtext("FrameHeight")),
                "d": [int(d.text) for d in node.iter("Duration")],  # en sesentavos de segundo
            }
        shutil.copy(fetch("portrait/%04d/Normal.png" % dex), os.path.join(OUT, "face-%s-Normal.png" % name))
        print(name, "ok")
    for name, dex in COMMANDERS.items():
        normal = fetch("portrait/%04d/Normal.png" % dex)
        for face in FACES:
            src = fetch("portrait/%04d/%s.png" % (dex, face)) or normal
            shutil.copy(src, os.path.join(OUT, "face-%s-%s.png" % (name, face)))
        print("comandante", name, "ok")
    with open(os.path.join(OUT, "anims.json"), "w") as f:
        json.dump(meta, f)


if __name__ == "__main__":
    main()
