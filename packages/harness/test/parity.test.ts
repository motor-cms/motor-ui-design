import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { run } from '../src/run.js'
import type { ParityConfig, RunSummary } from '../src/types.js'

// End-to-end tests of the engine on a synthetic neutral fixture (test/fixture): a tiny legacy page (HTML + CSS with
// viewport media queries) and Vue blocks (container query on the page root). No client data.
const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const root = resolve(pkg, '../..')
const work = join(root, '.tmp', 'parity-test')
const VPS = [375, 767, 768, 1024]

interface Setup {
  dir: string
  reference: string
}

const setup = (name: string, mutate?: (reference: string) => void): Setup => {
  const dir = join(work, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  cpSync(join(here, 'fixture'), dir, { recursive: true })
  const reference = join(dir, 'reference')
  mutate?.(reference)
  return { dir, reference }
}

const cfg = (s: Setup, over: Partial<ParityConfig> = {}): ParityConfig => ({
  reference: 'reference',
  blockMap: 'block-map.ts',
  css: ['theme.css'],
  theme: 'neutral',
  viewports: VPS,
  reportDir: join(s.dir, 'report'),
  ...over,
})

const go = (s: Setup, mode: 'gate' | 'validate', over: Partial<ParityConfig> = {}, extra: { scrollbar?: number } = {}) =>
  run({ mode, config: cfg(s, over), configDir: s.dir, cwd: s.dir, concurrency: 2, ...extra })

const failed = (r: RunSummary) => r.results.filter((x) => x.status === 'fail')
const keysOf = (rs: { key: string }[]) => [...new Set(rs.map((x) => x.key))].sort()

// Independent reference PNGs: the legacy markup and CSS screenshotted by plain Playwright, without the harness.
const writeReferencePngs = async (reference: string) => {
  const browser = await chromium.launch()
  try {
    for (const [key, inst, states] of [['DemoBlock', 'demo-1', ['default', 'hover']], ['PlainBlock', 'plain-1', ['default']]] as const) {
      const dir = join(reference, key, inst)
      const css = readFileSync(join(reference, 'frontend.css'), 'utf8')
      const html = readFileSync(join(dir, 'outer.html'), 'utf8')
      for (const vp of VPS) {
        const page = await browser.newPage({ viewport: { width: vp, height: 2800 }, deviceScaleFactor: 1 })
        await page.setContent(`<!doctype html><style>${css}</style><div id="box" style="width:${vp}px">${html}</div>`)
        const el = page.locator('#box > *').first()
        for (const st of states) {
          await page.mouse.move(0, 0)
          if (st === 'hover') await el.hover()
          writeFileSync(join(dir, `${vp}${st === 'default' ? '' : '-' + st}.png`), await el.screenshot({ animations: 'disabled', scale: 'css' }))
        }
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}

beforeAll(() => rmSync(work, { recursive: true, force: true }))
afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('gate: frontend against the live legacy render', () => {
  it('passes when the render is identical, for every block, viewport and state', async () => {
    const s = setup('gate-ok')
    const r = await go(s, 'gate')
    expect(failed(r), JSON.stringify(failed(r).map((x) => x.message))).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
    // Demo: 4 viewports x 2 states, Plain: 4 viewports x 1 state, each against legacy and builder-vs-frontend
    expect(r.results.filter((x) => x.comparison === 'frontend-vs-legacy').length).toBe(12)
    expect(r.results.filter((x) => x.comparison === 'builder-vs-frontend').length).toBe(12)
  }, 180_000)

  it('break-it: padding-top 1px on the legacy side fails that block only, and the style diff names padding-top', async () => {
    const s = setup('gate-padding', (ref) => writeFileSync(join(ref, 'frontend.css'), readFileSync(join(ref, 'frontend.css'), 'utf8') + '\n.plain { padding-top: 7px; }\n'))
    const r = await go(s, 'gate')
    expect(r.ok).toBe(false)
    expect(keysOf(failed(r))).toEqual(['PlainBlock'])
    const f = failed(r).filter((x) => x.comparison === 'frontend-vs-legacy')
    expect(f.length).toBe(VPS.length)
    for (const x of f) {
      expect(x.message).toMatch(/size differs/)
      const pt = x.styleDiffs!.find((d) => d.property === 'padding-top')
      expect(pt, JSON.stringify(x.styleDiffs)).toBeTruthy()
      expect(pt!.a).toBe('7px')
      expect(pt!.b).toBe('6px')
      expect(pt!.path).toBe('div')
    }
  }, 180_000)

  it('reports a block without a new implementation as missing and does not pass', async () => {
    const s = setup('gate-missing')
    const r = await go(s, 'gate', { blockMap: 'block-map.no-plain.ts' })
    expect(r.ok).toBe(false)
    expect(r.missing).toContainEqual({ key: 'PlainBlock', what: 'frontend' })
    expect(r.missing).toContainEqual({ key: 'PlainBlock', what: 'builder' })
    expect(r.results.filter((x) => x.key === 'PlainBlock')).toEqual([])
    expect(failed(r)).toEqual([])
    expect(r.results.filter((x) => x.key === 'DemoBlock').every((x) => x.status === 'pass')).toBe(true)
  }, 180_000)

  it('CLI exits non-zero when everything is missing (empty block map)', () => {
    const s = setup('cli-missing')
    writeFileSync(join(s.dir, 'block-map.ts'), 'export default {}\n')
    const p = spawnSync('node', [join(pkg, 'dist/cli.js'), '--config', join(s.dir, 'parity.config.mjs'), '--mode', 'gate', '--viewports', '375'], { cwd: s.dir, encoding: 'utf8', timeout: 120_000 })
    expect(p.status).toBe(1)
    expect(p.stdout).toMatch(/MISSING DemoBlock: no frontend/)
    expect(p.stdout).toMatch(/gate: FAILED/)
  }, 180_000)

  it('control: the CLI exits zero on the identical render', () => {
    const s = setup('cli-ok')
    const p = spawnSync('node', [join(pkg, 'dist/cli.js'), '--config', join(s.dir, 'parity.config.mjs'), '--mode', 'gate', '--viewports', '375,768'], { cwd: s.dir, encoding: 'utf8', timeout: 120_000 })
    expect(p.status, p.stdout + p.stderr).toBe(0)
    expect(p.stdout).toMatch(/gate: OK/)
  }, 180_000)
})

describe('builder against frontend, with exemptions', () => {
  it('fails when the builder differs, exempts it with a reason, never exempts against legacy', async () => {
    const s = setup('exemptions')
    const differs = { blockMap: 'block-map.builder-differs.ts' }
    const bad = await go(s, 'gate', differs)
    expect(bad.ok).toBe(false)
    const fb = failed(bad)
    expect(keysOf(fb)).toEqual(['DemoBlock'])
    expect(fb.every((x) => x.comparison === 'builder-vs-frontend')).toBe(true)
    expect(fb.some((x) => x.styleDiffs?.some((d) => d.property === 'padding-top'))).toBe(true)

    writeFileSync(join(s.dir, 'exemptions.json'), JSON.stringify({ DemoBlock: { reason: 'builder shows an extra top edge' } }))
    const ok = await go(s, 'gate', differs)
    expect(ok.ok).toBe(true)
    const ex = ok.results.filter((x) => x.status === 'exempt')
    expect(ex.length).toBe(fb.length)
    expect(ex[0].message).toMatch(/builder shows an extra top edge/)

    // only some viewports exempt: the rest still fails
    writeFileSync(join(s.dir, 'exemptions.json'), JSON.stringify({ DemoBlock: { viewports: [375], reason: 'x' } }))
    const partial = await go(s, 'gate', differs)
    expect(partial.ok).toBe(false)
    expect(failed(partial).every((x) => x.viewport !== 375)).toBe(true)

    // an exemption does not help a frontend that differs from legacy
    const s2 = setup('exemptions-legacy', (ref) => writeFileSync(join(ref, 'frontend.css'), readFileSync(join(ref, 'frontend.css'), 'utf8') + '\n.plain { padding-top: 7px; }\n'))
    writeFileSync(join(s2.dir, 'exemptions.json'), JSON.stringify({ PlainBlock: { reason: 'should not apply' } }))
    const legacy = await go(s2, 'gate')
    expect(legacy.ok).toBe(false)
    expect(failed(legacy).every((x) => x.comparison === 'frontend-vs-legacy' && x.key === 'PlainBlock')).toBe(true)
  }, 300_000)

  it('rejects an exemption without a reason', async () => {
    const s = setup('exemption-invalid')
    writeFileSync(join(s.dir, 'exemptions.json'), JSON.stringify({ DemoBlock: { viewports: [375] } }))
    await expect(go(s, 'gate')).rejects.toThrow(/needs a non-empty "reason"/)
  })
})

describe('breakpoint edges (scrollbar)', () => {
  it('a container query sees the width without the scrollbar: reported as an edge, not a generic diff', async () => {
    const s = setup('edge')
    const none = await go(s, 'gate', {}, { scrollbar: 0 })
    expect(none.ok).toBe(true)
    const bar = await go(s, 'gate', {}, { scrollbar: 15 })
    expect(bar.ok).toBe(false)
    const f = failed(bar)
    expect(keysOf(f)).toEqual(['DemoBlock'])
    // 768: legacy media query (viewport 768) switches, the container (753) does not; 767 matches on both sides
    expect(f.every((x) => x.viewport === 768)).toBe(true)
    expect(f.every((x) => x.edge === 'edge 767/768')).toBe(true)
    expect(f.length).toBeGreaterThan(0)
  }, 300_000)
})

describe('validate: legacy render against the reference PNGs', () => {
  it('passes when the legacy render reproduces the PNGs, and fails for the changed block only', async () => {
    const s = setup('validate')
    await writeReferencePngs(s.reference)
    const ok = await go(s, 'validate')
    expect(failed(ok), JSON.stringify(failed(ok).map((x) => x.message))).toEqual([])
    expect(ok.ok).toBe(true)
    expect(ok.results.length).toBe(12)

    // break-it: the legacy CSS changes after the PNGs were taken
    writeFileSync(join(s.reference, 'frontend.css'), readFileSync(join(s.reference, 'frontend.css'), 'utf8') + '\n.plain { padding-top: 7px; }\n')
    const bad = await go(s, 'validate')
    expect(bad.ok).toBe(false)
    expect(keysOf(failed(bad))).toEqual(['PlainBlock'])
  }, 300_000)
})
