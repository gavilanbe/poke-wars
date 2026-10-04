# Poké Wars

Prototipo privado: táctica por turnos tipo Advance Wars con gráficos de Pokémon Esmeralda.

```sh
pnpm install
pnpm dev          # el juego
pnpm sim          # 20 partidas IA contra IA en consola, para comprobar las reglas
```

`?auto` en la URL pone a las dos IA a jugar solas.

Para revisar animaciones sin verlas en movimiento (con el servidor en el puerto 5199):

```sh
node tools/film.mjs fuego captura gengar   # tiras de fotogramas en tools/preview/film-*.png
node tools/shots.mjs                       # capturas de menús y pantallas
```

Desde la consola del navegador se pueden lanzar escenas sueltas con `lab.battle(...)`, `lab.capture(...)` y
`lab.power('gengar')` (ejemplos en `tools/film.mjs`).

## Gráficos

Salen de la decompilación [pret/pokeemerald](https://github.com/pret/pokeemerald), que no se guarda en el repo:

```sh
git clone --depth 1 https://github.com/pret/pokeemerald vendor/pokeemerald
python3 -m venv .venv && .venv/bin/pip install pillow
pnpm assets       # regenera public/assets y las hojas de tools/preview
```

`tools/extract.py` monta los metatiles de 16x16 (tiles + paletas + `metatiles.bin`) en un atlas y recorta iconos y
sprites de las especies de la lista `SPECIES`. `tools/preview/tiles_general.png` numera cada metatile para elegirlos.

Los sprites animados del mapa y los retratos son de Pokémon Mundo Misterioso, bajados de
[PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) con `tools/extract_pmd.py`
(lista de especies y comandantes al principio del script; caché en `vendor/pmd`).

## Dónde tocar

- `src/data.ts`: terrenos, tabla de tipos, unidades (coste, movimiento, ataque…), el mapa en ASCII (mitad izquierda; se
  refleja) y la lista de edificios por la casilla de su puerta.
- `src/game.ts`: reglas (movimiento, daño, captura, turnos). Sin DOM.
- `src/ai.ts`: IA voraz.
- `src/main.ts`: pintado, menús, comandantes y pantalla de combate.
- `src/scene.ts`: motor de escenas (actores, partículas con los sprites de efectos de Esmeralda, parada de impacto).
- `src/cutscenes.ts`: escenas de combate (un ataque por tipo en `MOVES`) y de captura.
- `src/ui.ts` + `src/ui.css`: carteles a pantalla completa (cortinilla, cambio de turno, súper poder, «VS», victoria).
- `src/units.ts`, `src/fx.ts`, `src/sfx.ts`: sprites de las unidades, partículas del mapa y sonido.
- Comandantes (frases, modificadores y poder) en `COMMANDERS` de `src/data.ts`; el efecto del poder, en `usePower` de `src/game.ts`.
