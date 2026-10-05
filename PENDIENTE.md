# Pendiente

Ideas apuntadas el 4 de octubre de 2026, por orden de impacto.

## Queda por hacer
- En Archipiélago y Bosque Viejo alguna partida de IA contra IA no termina (el 1,9%; era el 2,8% antes de que la IA
  arriesgara más con la caja llena). Los dos bandos llegan al tope de 16 Pokémon con dinero de sobra y el frente se
  queda quieto en los vados; taparse la puerta del Centro no era la causa.
- Equilibrio por cruces: tras rehacer los equipos (ver abajo) quedan tres cruces a más de 9 puntos del 50%:
  Gengar gana a Lucario el 62%, Charizard a Pikachu el 59% y Gardevoir a Venusaur el 60% (`pnpm versus 150`).
- El fondo del combate (cielo y colinas) sigue pintado por código.
- Solo 16 líneas tienen tercera fase (`src/finals.json`).
- El modo escaparate del título sigue siendo los Pokémon paseando: falta una partida de IA contra IA de fondo.

## Hecho en la segunda pasada del 4 de octubre
- Título nuevo: «pulsa cualquier tecla», fondo desenfocado, comandantes enfrentados, botón principal, mapas con
  miniatura, opciones como interruptores y modo escaparate tras 30 s sin tocar nada.
- Teclado en todo el juego: las flechas mueven el cursor del mapa (la cámara, con WASD), Enter/Espacio/Z confirma,
  Esc/X cancela, Tab y Mayús+Tab cambian de Pokémon, E acaba el turno, P lanza el poder; menús con navegación por
  dirección y una barra con las teclas del momento.
- Tutorial (H): el juego de verdad jugándose solo dentro de un marco, con once lecciones explicadas paso a paso
  (`src/tutorial.ts`). La primera partida empieza por él.
- Captura de edificios y combate a pantalla completa; la captura tiene interfaz propia (quién, qué, barra de
  resistencia y cartel final).
- Vida en el mapa: ventanas encendidas de noche, humo en las chimeneas, los Pokémon miran al cursor y saltan al
  pasarles por encima.
- Equipos rehechos para que ningún cruce quede decidido por los tipos: 15 Pokémon nuevos y ningún tipo en más de 5 de
  11 (Normal en Pikachu y Psíquico en Gardevoir, 6). Con 8400 partidas, todos los comandantes ganan entre el 48% y el
  51% y los cruces se desvían de media 5,7 puntos (antes 11,2; el peor era 27%–73%).
- Atrapar salvajes es un minijuego de lanzamiento: un aro se cierra sobre el salvaje y se lanza cuando está pequeño;
  tres Balls con precio (300, 800 y 1500₽), tres intentos, y el salvaje puede liberarse o huir. La IA lanza una
  Poké Ball a suertes (85% si está debilitado, 35% si no) y también la paga.
- Bayas y monedas con los iconos de los juegos; el poder de comandante entra con retrato y nombre más grandes,
  fotograma de impacto, cara de enfado y ascuas.
- El turno rival se ve venir (cámara, camino, mira; Espacio lo acelera), la mira va sola al mejor objetivo al atacar
  y el menú de órdenes dice lo que va a pasar con cada una. Al elegir un Pokémon se pinta en rojo hasta dónde puede
  pegar, R enseña la zona de peligro de los rivales, y los de distancia y los de apoyo llevan insignia.
- `pnpm versus [rondas]`: liga en paralelo con la tabla de cruces. `pnpm matchups` (ventaja de tipos sin simular)
  se queda corto: no usarlo para decidir equipos.

## Hecho en la pasada larga del 4 de octubre
Tercera fase, guardar y continuar, ayuda (H), Tab al siguiente Pokémon, pantalla de pasar el ordenador, bocadillos
letra a letra, Poké Ball al atrapar, efectos y sonidos de estado y de nivel, luz del combate según la hora, IA que
defiende el gimnasio, tema de selección y ambiente de día. Después: tres mapas con selector, bayas y monedas, salvajes que se debilitan
antes de atraparlos, la IA congela ríos y quema cobertura, zoom con + y −, y nadadores que andan por tierra.

## Roles y comandantes (hecho el 4 de octubre; queda afinar)
- El capturador rinde demasiado por lo que cuesta y el volador y el bombardero, poco (tabla de roles de `pnpm sim`).
- La IA apenas compra exploradores, asaltantes y apoyos, así que esos roles están poco probados.
- Tierra, Bicho y Hada reutilizan la animación de ataque de Roca, Acero y Psíquico.

## Estructura de partida
- Una IA con plan: hoy cada unidad decide sola, no defiende su gimnasio ni se coordina.
- Equilibrio: los números siguen a ojo.

## Juice
- Cámara con intención: zoom al atacar o capturar.
- Unidades más grandes o con zoom: al lado de los edificios se ven pequeñas.

## Detalles
- El fondo del combate (cielo y colinas) sigue pintado por código.
- El botón de poder apagado se ve poco.
