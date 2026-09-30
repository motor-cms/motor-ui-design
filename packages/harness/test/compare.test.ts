import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { comparePng, diffStyles } from '../src/compare.js'
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
