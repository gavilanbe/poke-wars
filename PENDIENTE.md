# Pendiente

Ideas apuntadas el 4 de octubre de 2026, por orden de impacto.

## Identidad propia (hecho; queda afinar)
- La IA no usa «Congelar» y no busca quemar bosque a propósito.
- Los salvajes se atrapan con solo pisar su hierba con un capturador; falta debilitarlos antes.
- Solo 19 líneas tienen tercera fase (`src/finals.json`); el resto se queda en veterano al nivel 3.
- Objetos en el mapa (bayas, cajas con dinero).

## Hecho en la pasada larga del 4 de octubre
Tercera fase, guardar y continuar, ayuda (H), Tab al siguiente Pokémon, pantalla de pasar el ordenador, bocadillos
letra a letra, Poké Ball al atrapar, efectos y sonidos de estado y de nivel, luz del combate según la hora, IA que
defiende el gimnasio, tema de selección y ambiente de día.

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
