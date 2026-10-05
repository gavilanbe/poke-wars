// Sprites animados de Mundo Misterioso para las unidades del mapa.
// Cada hoja tiene 8 filas (direcciones) y un fotograma por columna; ver tools/extract_pmd.py.

export type Anim = 'Idle' | 'Walk' | 'Attack' | 'Hurt' | 'Charge' | 'Shoot' | 'Swing' | 'Hop' | 'Rotate'
interface AnimMeta { w: number; h: number; d: number[] } // d: duración de cada fotograma en 1/60 s

let meta: Record<string, Record<Anim, AnimMeta>> = {}
const images = new Map<string, HTMLImageElement>()
const dimmed = new Map<string, HTMLCanvasElement>()

export const DIR = { down: 0, right: 2, up: 4, left: 6 }
export const dirFrom = (dx: number, dy: number) =>
  Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? DIR.right : DIR.left) : dy > 0 ? DIR.down : DIR.up

export const facePath = (name: string, face = 'Normal') => `assets/pmd/face-${name}-${face}.png`

// Las hojas se cargan por especie y solo cuando hacen falta: son nueve imágenes por Pokémon y hay más de doscientos,
// así que traerlas todas al arrancar eran casi dos mil peticiones.
const pending = new Map<string, Promise<void>>()
const ready = new Set<string>()

/** Lee el índice de animaciones (tamaños y tiempos de todas las especies). Las imágenes vienen después. */
export async function loadUnits() {
  meta = await fetch('assets/pmd/anims.json').then((r) => r.json())
}

/** Carga, una sola vez, las hojas de una especie. */
export function loadSpecies(species: string): Promise<void> {
  let job = pending.get(species)
  if (!job) {
    job = Promise.all((Object.keys(meta[species] ?? {}) as Anim[]).map((anim) => new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = img.onerror = () => resolve()
      img.src = `assets/pmd/${species}-${anim}.png`
      images.set(`${species}-${anim}`, img)
    }))).then(() => void ready.add(species))
    pending.set(species, job)
  }
  return job
}
/** Deja listas varias especies (las de una partida, las de una lección…) para que no aparezcan a medias. */
export const loadSpeciesList = (list: Iterable<string>) => Promise.all([...new Set(list)].map(loadSpecies))

/** Altura del fotograma en reposo: sirve para decidir a qué escala cabe en una escena. */
export const spriteHeight = (species: string) => meta[species].Idle.h

export const animDuration = (species: string, anim: Anim) => (meta[species][anim].d.reduce((a, b) => a + b, 0) * 1000) / 60

/** Versión apagada (unidad que ya ha actuado). */
function dimmedSheet(id: string) {
  let c = dimmed.get(id)
  if (c) return c
  const img = images.get(id)!
  c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const cx = c.getContext('2d')!
  cx.drawImage(img, 0, 0)
  const data = cx.getImageData(0, 0, c.width, c.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
    for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] * 0.4 + lum * 0.6) * 0.55
  }
  cx.putImageData(data, 0, 0)
  dimmed.set(id, c)
  return c
}

// `tint`: silueta de un color con esa opacidad (destellos, K.O., evolución); `rot` en radianes
export interface SpriteOpts {
  dim?: boolean; white?: boolean; sx?: number; sy?: number; loop?: boolean
  tint?: [string, number]; rot?: number; alpha?: number
}

const scratch = document.createElement('canvas')
scratch.width = scratch.height = 128
const scratchCtx = scratch.getContext('2d')!

/** Pinta el fotograma que toca, centrado en (x, y); la escala se aplica desde los pies. */
export function drawSprite(
  ctx: CanvasRenderingContext2D, species: string, anim: Anim, dir: number, elapsed: number,
  x: number, y: number, { dim, white, sx = 1, sy = 1, loop = true, tint, rot = 0, alpha = 1 }: SpriteOpts = {},
) {
  if (!ready.has(species)) return void loadSpecies(species) // aún no ha llegado: se pide y se pinta cuando esté
  const m = meta[species][anim]
  const total = m.d.reduce((a, b) => a + b, 0)
  let t = (Math.max(0, elapsed) * 60) / 1000
  t = loop ? t % total : Math.min(t, total - 0.01)
  let frame = 0
  while (t >= m.d[frame]) t -= m.d[frame++]
  const id = `${species}-${anim}`
  const sheet = dim ? dimmedSheet(id) : images.get(id)!
  const feet = 10
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y + feet))
  ctx.scale(sx, sy)
  if (rot) { // gira alrededor del centro del cuerpo
    ctx.translate(0, -feet)
    ctx.rotate(rot)
    ctx.translate(0, feet)
  }
  ctx.globalAlpha *= alpha
  if (tint && tint[1] > 0) {
    scratchCtx.globalCompositeOperation = 'source-over'
    scratchCtx.clearRect(0, 0, 128, 128)
    scratchCtx.drawImage(sheet, frame * m.w, dir * m.h, m.w, m.h, 0, 0, m.w, m.h)
    scratchCtx.globalCompositeOperation = 'source-atop'
    scratchCtx.globalAlpha = tint[1]
    scratchCtx.fillStyle = tint[0]
    scratchCtx.fillRect(0, 0, m.w, m.h)
    scratchCtx.globalAlpha = 1
    ctx.drawImage(scratch, 0, 0, m.w, m.h, -m.w / 2, -m.h / 2 - feet, m.w, m.h)
    ctx.restore()
    return
  }
  const args = [frame * m.w, dir * m.h, m.w, m.h, -m.w / 2, -m.h / 2 - feet, m.w, m.h] as const
  ctx.drawImage(sheet, ...args)
  if (white) { // destello: se suma el sprite sobre sí mismo
    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(sheet, ...args)
    ctx.drawImage(sheet, ...args)
  }
  ctx.restore()
}
