import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

// Playwright's screenshot tolerance (DECISIONS 8): threshold 0.1 per pixel (perceptual colour distance,
// anti-aliased pixels ignored), at most 0.1 % of the pixels may differ.
export const TOLERANCE = { threshold: 0.1, maxDiffPixelRatio: 0.001 }

export interface PixelResult {
  sameSize: boolean
  sizeA: [number, number]
  sizeB: [number, number]
  diffPixels: number
  totalPixels: number
  ratio: number
  ok: boolean
  diffPng?: Buffer
}

export const comparePng = (a: Buffer, b: Buffer): PixelResult => {
  const pa = PNG.sync.read(a)
  const pb = PNG.sync.read(b)
  const sizeA: [number, number] = [pa.width, pa.height]
  const sizeB: [number, number] = [pb.width, pb.height]
  if (pa.width !== pb.width || pa.height !== pb.height) {
    return { sameSize: false, sizeA, sizeB, diffPixels: -1, totalPixels: Math.max(pa.width * pa.height, pb.width * pb.height), ratio: 1, ok: false }
  }
  const diff = new PNG({ width: pa.width, height: pa.height })
  const diffPixels = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: TOLERANCE.threshold })
  const totalPixels = pa.width * pa.height
  const ratio = totalPixels ? diffPixels / totalPixels : 0
  return { sameSize: true, sizeA, sizeB, diffPixels, totalPixels, ratio, ok: ratio <= TOLERANCE.maxDiffPixelRatio, diffPng: diffPixels ? PNG.sync.write(diff) : undefined }
}

export interface StyleEl {
  path: string
  style: Record<string, string>
}

/** Element-by-element computed-style diff. Elements are matched by their tag/child-index path below the root. */
export const diffStyles = (a: StyleEl[], b: StyleEl[]) => {
  const out: { path: string; property: string; a: string; b: string }[] = []
  const bm = new Map(b.map((e) => [e.path, e]))
  const am = new Map(a.map((e) => [e.path, e]))
  for (const ea of a) {
    const eb = bm.get(ea.path)
    if (!eb) {
      out.push({ path: ea.path, property: '(element)', a: 'present', b: 'missing' })
      continue
    }
    for (const k of new Set([...Object.keys(ea.style), ...Object.keys(eb.style)])) {
      if (ea.style[k] !== eb.style[k]) out.push({ path: ea.path, property: k, a: ea.style[k] ?? '', b: eb.style[k] ?? '' })
    }
  }
  for (const eb of b) if (!am.has(eb.path)) out.push({ path: eb.path, property: '(element)', a: 'missing', b: 'present' })
  // Properties the browser derives from layout come last: the cause (padding-top) before its effect (height).
  const derived = new Set(['width', 'height', 'block-size', 'inline-size', 'perspective-origin', 'transform-origin'])
  const rank = (d: { property: string }) => (derived.has(d.property) ? 1 : 0)
  return out.sort((x, y) => rank(x) - rank(y))
}

/**
 * Compare a legacy render made on a transparent page against a reference PNG that includes the backdrop the element was
 * screenshotted on (ancestors' backgrounds are not part of the excerpt).
 *
 * For a pixel the element paints with alpha a < LOW_ALPHA and colour C, the reference pixel is R = a*C + (1-a)*B, so the
 * backdrop B follows from R. The check is then that the derived backdrop is smooth: neighbouring pixels must not differ by
 * more than a step (widened where 1/(1-a) amplifies rounding). A wrong colour, a shifted glyph or an area the reference
 * paints and the render lacks leaves a jump and counts as a difference. Pixels with a >= LOW_ALPHA are composited onto the
 * backdrop of the nearest low-alpha pixel and compared with the reference like any other pixel. When the element paints
 * every pixel opaquely there is nothing to infer, the plain comparison is the answer.
 */
export const LOW_ALPHA = 0.9
export const BACKDROP_STEP = 8

export const compareWithBackdrop = (reference: Buffer, rgba: Buffer): PixelResult => {
  const ref = PNG.sync.read(reference)
  const leg = PNG.sync.read(rgba)
  const sizeA: [number, number] = [ref.width, ref.height]
  const sizeB: [number, number] = [leg.width, leg.height]
  const w = ref.width
  const h = ref.height
  const n = w * h
  const fail = (): PixelResult => ({ sameSize: true, sizeA, sizeB, diffPixels: n, totalPixels: n, ratio: 1, ok: false })
  if (w !== leg.width || h !== leg.height) return { sameSize: false, sizeA, sizeB, diffPixels: -1, totalPixels: n, ratio: 1, ok: false }
  const alpha = (i: number) => leg.data[i * 4 + 3] / 255
  const backdrop = new Float32Array(n * 3)
  const low = new Uint8Array(n)
  let queue: number[] = []
  const src = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const a = alpha(i)
    if (a >= LOW_ALPHA) continue
    low[i] = 1
    for (let k = 0; k < 3; k++) backdrop[i * 3 + k] = Math.min(255, Math.max(0, (ref.data[i * 4 + k] - a * leg.data[i * 4 + k]) / (1 - a)))
    src[i] = i
    queue.push(i)
  }
  if (!queue.length) return fail()
  while (queue.length) {
    const next: number[] = []
    for (const i of queue) {
      const x = i % w
      const y = (i - x) / w
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (src[j] === -1) {
          src[j] = src[i]
          next.push(j)
        }
      }
    }
    queue = next
  }
  const predicted = new PNG({ width: w, height: h })
  const refOpaque = new PNG({ width: w, height: h })
  for (let i = 0; i < n; i++) {
    const a = alpha(i)
    for (let k = 0; k < 3; k++) {
      predicted.data[i * 4 + k] = low[i] ? ref.data[i * 4 + k] : Math.round(a * leg.data[i * 4 + k] + (1 - a) * backdrop[src[i] * 3 + k])
      refOpaque.data[i * 4 + k] = ref.data[i * 4 + k]
    }
    predicted.data[i * 4 + 3] = 255
    refOpaque.data[i * 4 + 3] = 255
  }
  const limit = (i: number) => BACKDROP_STEP + 3 / (1 - alpha(i))
  const jump = (i: number, j: number) => {
    if (!low[i] || !low[j]) return false
    let d = 0
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(backdrop[i * 3 + k] - backdrop[j * 3 + k]))
    return d > Math.max(limit(i), limit(j))
  }
  let jumps = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (x + 1 < w && jump(i, i + 1)) jumps++
      if (y + 1 < h && jump(i, i + w)) jumps++
    }
  }
  const diff = new PNG({ width: w, height: h })
  const px = pixelmatch(refOpaque.data, predicted.data, diff.data, w, h, { threshold: TOLERANCE.threshold })
  const diffPixels = px + jumps
  const ratio = diffPixels / n
  return { sameSize: true, sizeA, sizeB, diffPixels, totalPixels: n, ratio, ok: ratio <= TOLERANCE.maxDiffPixelRatio, diffPng: diffPixels ? PNG.sync.write(diff) : undefined }
}
