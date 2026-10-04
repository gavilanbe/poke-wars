# Pendiente

Ideas apuntadas el 4 de octubre de 2026, por orden de impacto.

## Queda por hacer
- En Archipiélago y Bosque Viejo las partidas de IA contra IA se alargan (36 días de media) y alguna no termina:
  la IA se atasca en los vados.
- El fondo del combate (cielo y colinas) sigue pintado por código.
- Solo 19 líneas tienen tercera fase (`src/finals.json`).
- Equilibrio por mapa: `pnpm sim 30` y `pnpm tune`.

## Hecho en la pasada larga del 4 de octubre
Tercera fase, guardar y continuar, ayuda (H), Tab al siguiente Pokémon, pantalla de pasar el ordenador, bocadillos
letra a letra, Poké Ball al atrapar, efectos y sonidos de estado y de nivel, luz del combate según la hora, IA que
defiende el gimnasio, tema de selección y ambiente de día. Después: tres mapas con selector, bayas y monedas, salvajes que se debilitan
antes de atraparlos, la IA congela ríos y quema cobertura, zoom con + y −, y nadadores que andan por tierra.

## Roles y comandantes (hecho el 4 de octubre; queda afinar)
- Equilibrio: sumando 7 ligas (588 partidas por comandante) todos quedan entre el 47% y el 53%, dentro del ruido.
  Quedan emparejamientos concretos muy decantados por tipos (medirlos con `pnpm sim 30`).
- El capturador rinde demasiado por lo que cuesta y el volador y el bombardero, poco (tabla de roles de `pnpm sim`).
- La IA apenas compra exploradores, asaltantes y apoyos, así que esos roles están poco probados.
- Tierra, Bicho y Hada reutilizan la animación de ataque de Roca, Acero y Psíquico.
- Una tercera fase evolutiva para las líneas que la tienen.

## Estructura de partida
- Varios mapas y un selector.
- Una IA con plan: hoy cada unidad decide sola, no defiende su gimnasio ni se coordina.
- Equilibrio: los números siguen a ojo.

## Juice
- Cámara con intención: zoom al atacar o capturar.
- Vida en el mapa: Pokémon que miran al cursor, humo en chimeneas, ventanas encendidas de noche.
- Revisar la captura y los carteles a pantalla completa con el HUD nuevo.
- Unidades más grandes o con zoom: al lado de los edificios se ven pequeñas.

## Detalles
- El fondo del combate (cielo y colinas) sigue pintado por código.
- El botón de poder apagado se ve poco.
