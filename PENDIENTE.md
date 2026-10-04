# Pendiente

Ideas apuntadas el 4 de octubre de 2026, por orden de impacto.

## Identidad propia (hecho el 4 de octubre; queda afinar)
Tipos fuertes con doble tipo y dos ataques, terreno que reacciona (fuego quema, hielo congela, agua y planta se curan
en lo suyo), estados, experiencia con tres niveles, debilitados que se recuperan a mitad de precio y salvajes.
- La IA no usa «Congelar» y no busca quemar bosque a propósito.
- Los salvajes se atrapan con solo pisar su hierba con un capturador; falta debilitarlos antes, como en los juegos.
- El nivel 3 es solo un 10% de bonificación: falta una tercera fase evolutiva de verdad.
- Los ataques de cobertura usan la animación del tipo, pero no tienen nombre propio por Pokémon.
- Objetos en el mapa (bayas, cajas con dinero).

## Roles y comandantes (hecho el 4 de octubre; queda afinar)
- Equilibrio: sumando 7 ligas (588 partidas por comandante) todos quedan entre el 47% y el 53%, dentro del ruido.
  Quedan emparejamientos concretos muy decantados por tipos (medirlos con `pnpm sim 30`).
- El capturador rinde demasiado por lo que cuesta y el volador y el bombardero, poco (tabla de roles de `pnpm sim`).
- La IA apenas compra exploradores, asaltantes y apoyos, así que esos roles están poco probados.
- Tierra, Bicho y Hada reutilizan la animación de ataque de Roca, Acero y Psíquico.
- Una tercera fase evolutiva para las líneas que la tienen.

## Estructura de partida
- Varios mapas y un selector.
- Guardar la partida (se pierde al recargar).
- Una IA con plan: hoy cada unidad decide sola, no defiende su gimnasio ni se coordina.
- Equilibrio: los números siguen a ojo.

## Juice
- Textos que se escriben letra a letra con su sonido.
- Cámara con intención: zoom al atacar o capturar.
- Vida en el mapa: Pokémon que miran al cursor, humo en chimeneas, ventanas encendidas de noche.
- Revisar la captura y los carteles a pantalla completa con el HUD nuevo.
- Unidades más grandes o con zoom: al lado de los edificios se ven pequeñas.

## Detalles
- El fondo del combate (cielo y colinas) sigue pintado por código.
- El botón de poder apagado se ve poco.
