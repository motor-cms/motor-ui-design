import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Reader for the reference pack layout:
//   <ref>/<Key>/<instance>/{fixture.json, capture.json, outer.html, outer-<vp>.html, <vp>[-<state>].png}
//   <ref>/frontend*.css, <ref>/_images/, <ref>/_assets/
export interface CaptureState {
  status: string
  width?: number
  height?: number
  note?: string
}
export interface InstanceInfo {
  key: string
  instance: string
  dir: string
  host: string
  states: string[]
  capture: Record<string, Record<string, CaptureState>>
}

export const listKeys = (ref: string): string[] =>
  readdirSync(ref, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(ref, d.name)) && readdirSync(join(ref, d.name)).some((i) => existsSync(join(ref, d.name, i, 'fixture.json'))))
    .map((d) => d.name)
    .sort()

export const readFixture = (dir: string) => JSON.parse(readFileSync(join(dir, 'fixture.json'), 'utf8'))

export const listInstances = (ref: string, key: string): InstanceInfo[] =>
  readdirSync(join(ref, key), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ref, key, d.name, 'fixture.json')))
    .map((d) => {
      const dir = join(ref, key, d.name)
      const fx = readFixture(dir)
      const capture = JSON.parse(readFileSync(join(dir, 'capture.json'), 'utf8')).states ?? {}
      return { key, instance: d.name, dir, host: String(fx.host ?? ''), states: (fx.states as string[] | undefined) ?? ['default'], capture }
    })
    .sort((a, b) => a.instance.localeCompare(b.instance))

/** Markup for one viewport: outer-<vp>.html where the capture recorded a differing markup, else outer.html. */
export const outerHtml = (dir: string, viewport: number): string => {
  const f = join(dir, `outer-${viewport}.html`)
  return readFileSync(existsSync(f) ? f : join(dir, 'outer.html'), 'utf8').trim()
}

export const pngName = (viewport: number, state: string) => `${viewport}${state === 'default' ? '' : '-' + state}.png`

export const legacyCssFile = (ref: string, host: string, pick?: (host: string, files: string[]) => string): string => {
  const files = readdirSync(ref).filter((f) => /^frontend.*\.css$/.test(f))
  if (pick) return pick(host, files)
  const own = `frontend.${host}.css`
  if (files.includes(own)) return own
  if (files.includes('frontend.css')) return 'frontend.css'
  throw new Error(`no legacy CSS for host "${host}" in ${ref} (expected ${own} or frontend.css)`)
}

/** Width and height of a PNG from its IHDR chunk. */
export const pngSize = (file: string): [number, number] => {
  const b = readFileSync(file)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

/**
 * Sub-pixel origin (fractional x and y, in px) of the element on the captured page. The capture screenshots the
 * element's bounding box rounded outwards: a PNG one pixel larger than the element's size means the element started
 * at a fractional position. The position itself is not recorded in the pack, so it is inferred from the sizes: any
 * origin o in [0, 1) with ceil(o + size) = PNG size is consistent, the middle of that range is used. The same origin is
 * used for every render of the instance, so that legacy and new blocks sit at the same sub-pixel position.
 */
export const inferOrigin = (png: [number, number], size: { width?: number; height?: number }): [number, number] => {
  const one = (px: number, len: number | undefined) => {
    if (len === undefined) return 0
    const lo = Math.max(px - 1 - len, 0)
    const hi = Math.min(px - len, 0.999)
    return hi > lo ? Math.round(((lo + hi) / 2) * 1000) / 1000 : 0
  }
  return [one(png[0], size.width), one(png[1], size.height)]
}

/** Candidate sub-pixel origins (eighth pixels) consistent with the PNG size. */
export const originCandidates = (png: [number, number], size: { width?: number; height?: number }): [number, number][] => {
  const steps = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
  const ok = (px: number, len: number | undefined, o: number) => len === undefined || Math.ceil(o + len - 1e-9) === px
  const xs = steps.filter((o) => ok(png[0], size.width, o))
  const ys = steps.filter((o) => ok(png[1], size.height, o))
  const out: [number, number][] = []
  for (const y of ys.length ? ys : [0]) for (const x of xs.length ? xs : [0]) out.push([x, y])
  return out
}
