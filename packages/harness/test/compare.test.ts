import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { comparePng, compareWithBackdrop, diffStyles } from '../src/compare.js'
import { inferOrigin, originCandidates } from '../src/pack.js'

const solid = (w: number, h: number, rgb: [number, number, number], dot?: [number, number]) => {
  const p = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) p.data.set([...rgb, 255], i * 4)
  if (dot) p.data.set([0, 0, 0, 255], (dot[1] * w + dot[0]) * 4)
  return PNG.sync.write(p)
}

describe('comparePng', () => {
  it('passes identical images and images within maxDiffPixelRatio', () => {
    expect(comparePng(solid(100, 100, [200, 200, 200]), solid(100, 100, [200, 200, 200])).ok).toBe(true)
    // 5 black pixels of 10000 = 0.05 %
    const many = new PNG({ width: 100, height: 100 })
    for (let i = 0; i < 10000; i++) many.data.set([200, 200, 200, 255], i * 4)
    for (let i = 0; i < 5; i++) many.data.set([0, 0, 0, 255], (i * 300 + 7) * 4)
    expect(comparePng(solid(100, 100, [200, 200, 200]), PNG.sync.write(many)).ok).toBe(true)
  })
  it('fails above the ratio, on a different size, and on a clearly different colour', () => {
    const c = comparePng(solid(100, 100, [200, 200, 200]), solid(100, 100, [120, 120, 120]))
    expect(c.ok).toBe(false)
    expect(c.diffPixels).toBe(10000)
    const s = comparePng(solid(100, 100, [200, 200, 200]), solid(100, 101, [200, 200, 200]))
    expect(s.ok).toBe(false)
    expect(s.sameSize).toBe(false)
  })
})

describe('diffStyles', () => {
  it('names property, element and both values; reports missing elements', () => {
    const a = [{ path: 'div', style: { 'padding-top': '1px', color: 'red' } }, { path: 'div > p[0]', style: { color: 'red' } }]
    const b = [{ path: 'div', style: { 'padding-top': '2px', color: 'red' } }]
    expect(diffStyles(a, b)).toEqual([
      { path: 'div', property: 'padding-top', a: '1px', b: '2px' },
      { path: 'div > p[0]', property: '(element)', a: 'present', b: 'missing' },
    ])
    expect(diffStyles(a, a)).toEqual([])
  })
})

describe('sub-pixel origin', () => {
  it('is zero for a whole-pixel screenshot and inside the feasible range otherwise', () => {
    expect(inferOrigin([340, 144], { width: 340, height: 144 })).toEqual([0, 0])
    const [x, y] = inferOrigin([341, 145], { width: 340, height: 144 })
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
    expect(originCandidates([341, 145], { width: 340, height: 144 }).every(([cx, cy]) => cx > 0 && cy > 0)).toBe(true)
    expect(originCandidates([340, 144], { width: 340, height: 144 })).toEqual([[0, 0]])
  })
})

describe('compareWithBackdrop', () => {
  const W = 120
  const H = 60
  // reference: horizontal gradient backdrop; a 60x30 box in the middle painted 50 % white over it
  const bg = (x: number) => 200 + Math.round((x * 40) / W)
  const build = (paint: (x: number, y: number) => number) => {
    const ref = new PNG({ width: W, height: H })
    const leg = new PNG({ width: W, height: H })
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const a = paint(x, y)
        const c = (t: number) => Math.round(a * 255 + (1 - a) * bg(x) * t)
        ref.data.set([c(1), c(0.9), c(0.8), 255], i)
        leg.data.set([255, 255, 255, Math.round(a * 255)], i)
      }
    return { ref: PNG.sync.write(ref), leg: PNG.sync.write(leg) }
  }
  const box = (x: number, y: number) => (x >= 30 && x < 90 && y >= 15 && y < 45 ? 0.5 : 0)

  it('accepts a translucent element over a smooth backdrop that only the reference has', () => {
    const { ref, leg } = build(box)
    expect(comparePng(ref, leg).ok).toBe(false) // compared as they are, the two differ
    expect(compareWithBackdrop(ref, leg).ok).toBe(true)
  })

  it('rejects a render that lacks something the reference paints, and one with a shifted box', () => {
    const { ref } = build(box)
    const missing = build(() => 0).leg
    expect(compareWithBackdrop(ref, missing).ok).toBe(false)
    const shifted = build((x, y) => box(x - 4, y)).leg
    expect(compareWithBackdrop(ref, shifted).ok).toBe(false)
  })

  it('has nothing to infer for a fully opaque element', () => {
    const { ref } = build(() => 1)
    expect(compareWithBackdrop(ref, ref).ok).toBe(false)
  })
})
