// Todo lo que hace falta para jugar en un móvil: la pantalla se pinta a una altura fija (así el HUD, pensado para un
// monitor, cabe entero y con el mismo aspecto), se pide ponerlo en horizontal, no se apaga la pantalla a media partida
// y los golpes vibran. La entrada con los dedos (tocar, arrastrar, pellizcar) vive en main.ts, junto a la del ratón.

/** Altura, en píxeles de CSS, a la que se dibuja el juego en una pantalla pequeña. */
const VIRTUAL_H = 560
const root = document.documentElement
const viewport = document.querySelector<HTMLMetaElement>('meta[name=viewport]')!

/** ¿Es un aparato de dedo (móvil o tableta), no un portátil con pantalla táctil? */
export const handheld = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0
/** ¿Se está jugando como aplicación instalada? */
export const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true

let touch = false
const listeners: (() => void)[] = []
/** ¿Lo último que se usó fue un dedo? Entonces la interfaz enseña botones en vez de teclas. */
export const isTouch = () => touch
export function setTouch(on = true) {
  if (touch === on) return
  touch = on
  root.classList.toggle('touch', on)
  for (const fn of listeners) fn()
}
export const onTouchChange = (fn: () => void) => void listeners.push(fn)

// ---------- Pantalla a altura fija ----------

/**
 * En un móvil apaisado caben unos 390 píxeles de alto y el juego necesita más de 500. En vez de rehacer cada panel,
 * se le dice al navegador que la página mide más (con la misma proporción que la pantalla) y él la encoge entera.
 * La proporción no depende de la unidad, así que da igual llamarlo antes o después de haber cambiado la escala.
 */
function fitViewport() {
  if (!handheld) return
  const aspect = innerWidth / innerHeight
  const small = Math.min(screen.width, screen.height) < VIRTUAL_H + 80
  const want = aspect > 1 && small ? `width=${Math.round(VIRTUAL_H * aspect)}` : 'width=device-width, initial-scale=1'
  const content = `${want}, viewport-fit=cover, user-scalable=no`
  if (viewport.content !== content) viewport.content = content
}

// ---------- Horizontal y pantalla completa ----------

type Lockable = ScreenOrientation & { lock?: (orientation: string) => Promise<void> }
export const canFullscreen = !!root.requestFullscreen && !installed
export const isFullscreen = () => !!document.fullscreenElement
/** Pantalla completa y, donde el navegador lo permite (Android), girada a horizontal aunque el móvil esté de pie. */
export async function goFullscreen(on = true) {
  try {
    if (on && !document.fullscreenElement) await root.requestFullscreen({ navigationUI: 'hide' })
    else if (!on && document.fullscreenElement) await document.exitFullscreen()
    if (on) await (screen.orientation as Lockable).lock?.('landscape')
  } catch { /* iOS no deja ni lo uno ni lo otro: queda el aviso de girar el móvil */ }
}

// ---------- Pantalla encendida ----------

let lock: { release: () => Promise<void> } | null = null
async function stayAwake() {
  if (!handheld || document.hidden || lock) return
  try {
    lock = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void>; addEventListener: (type: string, fn: () => void) => void }> } }).wakeLock.request('screen')
    ;(lock as unknown as EventTarget).addEventListener('release', () => (lock = null))
  } catch { lock = null }
}

// ---------- Vibración ----------

/** Un golpecito en la mano (solo donde hay motor de vibración y se está jugando con el dedo). */
export function buzz(pattern: number | number[]) {
  if (touch && navigator.vibrate) try { navigator.vibrate(pattern) } catch { /* sin permiso */ }
}

export function initMobile() {
  fitViewport()
  addEventListener('resize', fitViewport)
  addEventListener('orientationchange', () => setTimeout(fitViewport, 60))
  if (handheld) setTouch(true)
  // El primer dedo que toca la pantalla cambia la interfaz a táctil; el teclado no la devuelve (un móvil no tiene)
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true); void stayAwake() }, true)
  document.addEventListener('visibilitychange', () => void stayAwake())
  if (!handheld) return
  // De pie no se puede jugar: el aviso de girar es también un botón que, en Android, lo gira por ti
  const turn = document.querySelector<HTMLElement>('#rotate')
  if (turn) { turn.onclick = () => void goFullscreen(); if (!canFullscreen) turn.querySelector('small')?.remove() } // en iPhone no se puede girar desde aquí
  // Nada de menú al dejar el dedo, ni de seleccionar texto, ni de zoom con dos toques
  addEventListener('contextmenu', (e) => e.preventDefault())
  addEventListener('gesturestart', (e) => e.preventDefault())
  addEventListener('dblclick', (e) => e.preventDefault())
}
