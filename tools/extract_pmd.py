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

# Las unidades salen de los equipos de cada comandante (src/rosters.json); el número de la Pokédex se resuelve
# con el índice de SpriteCollab (vendor/pmd/tracker.json).
import re

with open(os.path.join(ROOT, "src", "rosters.json")) as f:
    ROSTERS = json.load(f)
with open(os.path.join(CACHE, "tracker.json")) as f:
    _norm = lambda name: re.sub(r"[^a-z0-9]", "", name.lower())
    DEX = {_norm(v["name"]): int(k) for k, v in json.load(f).items() if int(k) > 0}
UNITS = {sp: DEX[_norm(sp)] for roster in ROSTERS.values() for line in roster.values() for sp in line[:2] if sp}
with open(os.path.join(ROOT, "src", "finals.json")) as f:  # terceras fases
    UNITS.update({sp: DEX[_norm(sp)] for sp in json.load(f).values()})
# Comandantes: retratos con varias caras, y también su sprite (pasean por el mapa del mundo de la campaña)
COMMANDERS = {name: DEX[_norm(name)] for name in ROSTERS}
# Personajes de la historia que no mandan equipo: el Gran Maestro y su ayudante
COMMANDERS.update({name: DEX[_norm(name)] for name in ["slowking", "chatot"]})
UNITS.update(COMMANDERS)
ANIMS = ["Idle", "Walk", "Attack", "Hurt", "Charge", "Shoot", "Swing", "Hop", "Rotate"]
FACES = ["Normal", "Happy", "Pain", "Determined", "Angry", "Worried", "Surprised", "Sad"]


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
            # No todas las especies tienen todas las animaciones: se cae a la de ataque o a la de reposo
            node = anims.get(anim) or anims.get("Attack") or anims["Idle"]
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
    with open(os.path.join(OUT, "dex.json"), "w") as f:  # lo usa tools/make_audio.mjs para los gritos
        json.dump({**UNITS, **COMMANDERS}, f)


if __name__ == "__main__":
    main()
