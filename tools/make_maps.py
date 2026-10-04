"""Genera src/maps.ts: cada mapa se pinta en su mitad izquierda (15x20) y se refleja. Comprueba que los edificios
no pisan agua ni se solapan y que se puede llegar andando desde la salida a todas las puertas.

  python3 tools/make_maps.py
"""
import json
import os
import re
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 15, 20
SIZE = {"house": (2, 0), "mart": (2, 0), "center": (3, 1), "gym": (3, 1)}  # ancho y columna de la puerta


def blank():
    return [["."] * W for _ in range(H)]


def rect(g, ch, x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = ch


def put(g, ch, cells):
    for x, y in cells:
        g[y][x] = ch


def footprint(t, x, y):
    w, d = SIZE[t]
    return [(x - d + i, y + dy) for i in range(w) for dy in (-1, 0)]


def build(name, blurb, g, left_buildings, start):
    rows = ["".join(r) + "".join(reversed(r)) for r in g]
    buildings = []
    for t, owner, x, y in left_buildings:
        buildings.append((t, owner, x, y))
    for t, owner, x, y in left_buildings:
        w, d = SIZE[t]
        buildings.append((t, 1 if owner == 0 else owner, 2 * W - 1 - x - (w - 1 - 2 * d), y))
    solid = {}
    for t, owner, x, y in buildings:
        for cx, cy in footprint(t, x, y):
            assert 0 <= cx < 2 * W and 0 <= cy < H, (name, t, x, y, "fuera del mapa")
            assert rows[cy][cx] not in "~s", (name, t, x, y, "sobre el agua")
            assert (cx, cy) not in solid, (name, t, x, y, "solapa con", solid[(cx, cy)])
            solid[(cx, cy)] = (t, x, y)
    doors = {(x, y) for _, _, x, y in buildings}
    walk = lambda x, y: 0 <= x < 2 * W and 0 <= y < H and rows[y][x] != "~" and ((x, y) not in solid or (x, y) in doors)
    assert walk(*start) and walk(start[0] + 1, start[1]), (name, "salida bloqueada")
    seen, queue = {start}, deque([start])
    while queue:
        x, y = queue.popleft()
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n not in seen and walk(*n):
                seen.add(n)
                queue.append(n)
    missing = [d for d in doors if d not in seen]
    assert not missing, (name, "puertas inalcanzables", missing)
    sx, sy = start
    starts = [("capturador", 0, sx, sy), ("explorador", 0, sx + 1, sy), ("capturador", 1, 2 * W - 1 - sx, sy), ("explorador", 1, 2 * W - 2 - sx, sy)]
    return {"name": name, "blurb": blurb, "rows": rows,
            "buildings": [{"type": t, "owner": o, "x": x, "y": y} for t, o, x, y in buildings],
            "starts": [{"role": r, "team": t, "x": x, "y": y} for r, t, x, y in starts]}


def rio_central():
    g = blank()
    rect(g, "=", 2, 11, 13, 11); rect(g, "=", 13, 11, 13, 13); rect(g, "=", 9, 4, 9, 11); rect(g, "=", 9, 7, 13, 7)
    rect(g, "=", 8, 4, 9, 4); rect(g, "=", 3, 11, 3, 15); rect(g, "=", 3, 5, 3, 11); rect(g, "=", 2, 5, 3, 5)
    rect(g, "~", 14, 0, 14, 19); rect(g, "~", 13, 0, 13, 2); rect(g, "~", 13, 9, 13, 10); rect(g, "~", 13, 16, 13, 19); rect(g, "~", 6, 17, 8, 19)
    put(g, "s", [(14, 6), (14, 7), (14, 13), (13, 18), (14, 18)])
    put(g, "=", [(13, 11), (13, 12), (13, 13)])
    put(g, "T", [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (0, 2), (5, 0), (10, 0), (11, 0), (10, 1), (0, 19), (1, 19), (0, 18), (0, 17), (2, 19), (4, 6), (5, 6), (4, 7), (12, 14), (12, 15), (11, 15), (0, 6), (0, 7), (7, 13), (8, 13), (12, 4), (11, 17), (12, 17)])
    put(g, "M", [(6, 1), (6, 2), (12, 3), (9, 13), (1, 15), (2, 15), (11, 18), (6, 8)])
    put(g, '"', [(4, 4), (5, 4), (6, 4), (5, 5), (6, 5), (10, 13), (11, 13), (10, 14), (11, 14), (3, 18), (4, 18), (4, 19), (5, 19), (0, 8), (1, 8), (0, 9), (10, 8), (11, 8)])
    b = [("gym", 0, 3, 10), ("center", 0, 7, 10), ("house", 0, 1, 13), ("house", 0, 5, 13), ("house", -1, 2, 4), ("mart", -1, 8, 3),
         ("center", -1, 11, 6), ("house", -1, 3, 17), ("mart", -1, 9, 16), ("house", -1, 11, 10)]
    return build("Río Central", "Un río con tres vados separa los dos bandos.", g, b, (3, 11))


def archipielago():
    g = blank()
    rect(g, "~", 12, 0, 14, 19)  # mar central
    rect(g, "~", 0, 9, 14, 10)  # canal que parte cada orilla en dos islas
    rect(g, "~", 0, 0, 0, 1); rect(g, "~", 0, 18, 1, 19)
    put(g, "s", [(3, 9), (3, 10), (4, 9), (4, 10), (9, 9), (9, 10), (12, 4), (13, 4), (14, 4), (12, 15), (13, 15), (14, 15)])
    rect(g, "=", 2, 5, 10, 5); rect(g, "=", 3, 5, 3, 8); rect(g, "=", 9, 5, 9, 8); rect(g, "=", 3, 11, 3, 16); rect(g, "=", 3, 16, 10, 16); rect(g, "=", 9, 11, 9, 16)
    put(g, "T", [(1, 0), (2, 0), (10, 0), (11, 0), (11, 1), (0, 7), (0, 8), (6, 7), (7, 7), (11, 8), (0, 11), (0, 12), (11, 11), (11, 12), (6, 18), (7, 18), (7, 19), (2, 19), (11, 18), (11, 19)])
    put(g, "M", [(5, 1), (11, 6), (1, 14), (7, 12), (10, 18)])
    put(g, '"', [(5, 7), (5, 8), (6, 8), (10, 7), (1, 6), (1, 7), (6, 11), (7, 11), (10, 13), (10, 14), (4, 18), (5, 18), (4, 19), (5, 19), (1, 12)])
    b = [("gym", 0, 3, 4), ("center", 0, 7, 4), ("house", 0, 10, 3), ("house", 0, 0, 4), ("house", -1, 7, 8), ("mart", -1, 1, 13),
         ("center", -1, 6, 15), ("house", -1, 10, 12), ("mart", -1, 8, 18), ("house", -1, 1, 17)]
    return build("Archipiélago", "Islas unidas por vados: los nadadores y los voladores mandan.", g, b, (3, 5))


def bosque_viejo():
    g = blank()
    rect(g, "~", 14, 0, 14, 19)
    put(g, "s", [(14, 3), (14, 10), (14, 11), (14, 16)])
    rect(g, "~", 9, 0, 10, 1); rect(g, "~", 6, 18, 8, 19)
    rect(g, "=", 2, 11, 13, 11); rect(g, "=", 5, 4, 5, 11); rect(g, "=", 5, 4, 13, 4); rect(g, "=", 13, 3, 13, 4); rect(g, "=", 8, 11, 8, 17); rect(g, "=", 8, 16, 13, 16)
    forest = [(x, y) for y in range(H) for x in range(W) if g[y][x] == "." and ((x * 7 + y * 13) % 5 < 2) and not (2 <= x <= 9 and 8 <= y <= 12)]
    put(g, "T", forest)
    put(g, '"', [(x, y) for y in range(H) for x in range(W) if g[y][x] == "." and (x * 3 + y * 5) % 7 == 0])
    put(g, "M", [(12, 7), (11, 13), (2, 15), (1, 2)])
    b = [("gym", 0, 3, 10), ("center", 0, 7, 10), ("house", 0, 1, 7), ("house", 0, 3, 14), ("house", -1, 2, 4), ("mart", -1, 8, 3),
         ("center", -1, 11, 7), ("house", -1, 11, 10), ("mart", -1, 4, 17), ("center", -1, 11, 15)]
    for t, _, x, y in b:  # claro alrededor de cada edificio y delante de la puerta
        for cx, cy in footprint(t, x, y) + [(x, y + 1)]:
            if cy < H and g[cy][cx] in 'T"M':
                g[cy][cx] = "."
    for x, y in [(3, 11), (4, 11)]:
        g[y][x] = "="
    return build("Bosque Viejo", "Bosque cerrado y hierba alta: emboscadas, fuego y poca visibilidad.", g, b, (3, 11))


maps = [rio_central(), archipielago(), bosque_viejo()]
out = "// Generado por tools/make_maps.py: no editar a mano.\nimport type { BuildingType, RoleId } from './data'\n\n"
out += "export interface MapDef {\n  name: string\n  blurb: string\n  rows: string[]\n  buildings: { type: BuildingType; owner: -1 | 0 | 1; x: number; y: number }[]\n  starts: { role: RoleId; team: 0 | 1; x: number; y: number }[]\n}\n\n"
out += "export const MAPS = " + re.sub(r'"(\w+)":', r"\1:", json.dumps(maps, ensure_ascii=False, indent=2)) + " as MapDef[]\n"
open(os.path.join(ROOT, "src", "maps.ts"), "w").write(out)
for m in maps:
    print(m["name"], len(m["buildings"]), "edificios")
    print("\n".join(m["rows"]))
