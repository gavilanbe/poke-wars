# Poké Wars

Táctica por turnos tipo Advance Wars con Pokémon: ocho comandantes con su equipo y su poder, tres mapas, captura de
edificios y de salvajes, evoluciones, clima, día y noche, y una IA contra la que jugar.

Tiene un **modo historia**, «La Guerra de las Banderas»: ocho misiones con mapa propio y objetivos distintos (ganar una
batalla, capturar un edificio concreto, aguantar un asedio, escoltar a un mensajero entre la niebla, derrotar a un jefe,
una carrera por edificios, un duelo sin refuerzos y un final de noche perpetua), con conversaciones, comandantes que se
unen a ti y nota por misión. Además, partida libre contra la IA o entre dos personas en tres mapas.

**▶ Jugar: https://gavilanbe.github.io/poke-wars/**

Todo se maneja con ratón o con teclado (flechas, Enter, Esc; `H` abre un tutorial que juega solo). Hecho con Claude
Opus 5.5.

```sh
pnpm install
pnpm dev          # el juego
pnpm sim          # 20 partidas IA contra IA en consola, para comprobar las reglas
pnpm versus 100   # liga en paralelo: porcentaje de victorias de cada cruce de comandantes
pnpm duel a b     # un cruce concreto a fondo, mapa por mapa
pnpm check        # comprobaciones de sentido común sobre mapas y equipos
pnpm missions 20  # campaña: valida cada misión y la juega IA contra IA para ver su dificultad
```

`?auto` en la URL pone a las dos IA a jugar solas.

Para revisar animaciones sin verlas en movimiento (con el servidor en el puerto 5199):

```sh
node tools/film.mjs fuego captura gengar   # tiras de fotogramas en tools/preview/film-*.png
node tools/shots.mjs                       # capturas de menús y pantallas
```

Desde la consola del navegador se pueden lanzar escenas sueltas con `lab.battle(...)`, `lab.capture(...)` y
`lab.power('gengar')` (ejemplos en `tools/film.mjs`).

## En el móvil (PWA)

El juego se instala como aplicación y se juega con el dedo, en horizontal:

- **Pantalla**: en un móvil la página se pinta a 560 px de alto y el navegador la encoge entera (`src/mobile.ts`), así
  el HUD es el mismo que en un monitor. De pie sale un aviso de girar el móvil; en Android, tocarlo lo gira solo.
- **Dedos** (`src/main.ts`, «Dedos»): tocar elige, arrastrar mueve la cámara (con inercia), dos dedos hacen zoom. Para
  atacar, el primer toque enseña el pronóstico y el segundo confirma. Lo que con teclado son Esc, Tab y R tiene botón.
- **Sin conexión y versiones** (`public/sw.js`, `src/pwa.ts`): lo necesario para arrancar se guarda al instalar; las
  imágenes y sonidos, según se usan, o todos de golpe con «Jugar sin conexión». Una versión nueva entra sola en el
  título y, en mitad de una partida, avisa con un botón. La compilación (`vite.config.ts`) escribe `precache.json`.
- **Icono**: `node tools/make_icons.mjs` lo vuelve a dibujar en todos los tamaños (`public/icons`).

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

El mapa usa un tileset de la comunidad con estilo de 4ª generación y un agua animada de RPG Maker (recursos de
Pokémon Essentials tomados del repositorio de Pokémon Infinite Fusion): `tools/extract_map.py`. Las fuentes de
`public/fonts` salen de las hojas de letras de Esmeralda con `tools/make_font.py` (necesita `fonttools` y `brotli`
en el `.venv`); Jersey 15/25 son de Google Fonts.

## Sonido

La música y los efectos están generados con ElevenLabs y viven en `public/audio`. Para regenerar o añadir:

```sh
echo 'ELEVENLABS_API_KEY=...' > .env.audio   # ignorado por git
node tools/make_audio.mjs                     # genera lo que falte
node tools/make_audio.mjs hit music_battle    # regenera esos
```

Las descripciones de cada efecto y tema están al principio de `tools/make_audio.mjs`. `src/sfx.ts` los reproduce y, si
falta algún archivo, usa un sonido sintetizado.

## Dónde tocar

- `src/rosters.json`: el equipo de cada comandante (un Pokémon por rol, con su evolución y su tipo). Tras cambiarlo:
  `.venv/bin/python tools/extract_pmd.py` (sprites y retratos) y `node tools/make_audio.mjs` (gritos).
- `src/data.ts`: terrenos, tabla de tipos, unidades (coste, movimiento, ataque…), el mapa en ASCII (mitad izquierda; se
  refleja) y la lista de edificios por la casilla de su puerta.
- `src/game.ts`: reglas (movimiento, daño, captura, turnos). Sin DOM.
- `src/ai.ts`: IA voraz.
- `src/main.ts`: pintado, menús, comandantes y pantalla de combate.
- `src/scene.ts`: motor de escenas (actores, partículas con los sprites de efectos de Esmeralda, parada de impacto).
- `src/cutscenes.ts`: escenas de combate (un ataque por tipo en `MOVES`) y de captura.
- `src/hud.css`: HUD superpuesto (placas de comandante, reloj, tarjeta de información, botones, minimapa); las piezas se
  recolorean por equipo en `setupHud` de `src/main.ts`.
- `src/ui.ts` + `src/ui.css`: carteles a pantalla completa (cortinilla, cambio de turno, súper poder, «VS», victoria).
- `src/units.ts`, `src/fx.ts`, `src/sfx.ts`: sprites de las unidades, partículas del mapa y sonido.
- Comandantes (frases, modificadores y poder) en `COMMANDERS` de `src/data.ts`; el efecto del poder, en `usePower` de `src/game.ts`.

## Créditos y aviso

Juego de fans sin ánimo de lucro. Pokémon y sus personajes son propiedad de Nintendo, Game Freak y The Pokémon
Company; este proyecto no está afiliado ni respaldado por ellos.

- Sprites y retratos animados de los Pokémon: [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
  (cada sprite acredita a su autor allí; licencia CC BY-NC 4.0).
- Mapa, edificios, efectos e interfaz: extraídos de Pokémon Esmeralda a través de
  [pret/pokeemerald](https://github.com/pret/pokeemerald).
- Gritos e iconos de objetos: [PokeAPI](https://github.com/PokeAPI) (cries y sprites).
- Música y efectos de sonido: generados con ElevenLabs.
