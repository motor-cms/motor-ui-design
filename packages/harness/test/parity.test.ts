import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BG_DONE } from '../src/browser.js'
import { run, type RunOptions } from '../src/run.js'
import { startServer } from '../src/server.js'
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

const go = (s: Setup, mode: 'gate' | 'validate', over: Partial<ParityConfig> = {}, extra: Partial<RunOptions> = {}) =>
  run({ mode, config: cfg(s, over), configDir: s.dir, cwd: s.dir, concurrency: 2, ...extra })

const failed = (r: RunSummary) => r.results.filter((x) => x.status === 'fail')
const keysOf = (rs: { key: string }[]) => [...new Set(rs.map((x) => x.key))].sort()

// Independent reference PNGs: the legacy markup and CSS screenshotted by plain Playwright, without the harness.
const writeReferencePngs = async (reference: string, boxStyle = '') => {
  const browser = await chromium.launch()
  try {
    for (const [key, inst, states] of [['DemoBlock', 'demo-1', ['default', 'hover']], ['PlainBlock', 'plain-1', ['default']]] as const) {
      const dir = join(reference, key, inst)
      const css = readFileSync(join(reference, 'frontend.css'), 'utf8')
      const html = readFileSync(join(dir, 'outer.html'), 'utf8')
      for (const vp of VPS) {
        const page = await browser.newPage({ viewport: { width: vp, height: 2800 }, deviceScaleFactor: 1 })
        await page.setContent(`<!doctype html><style>${css}</style><div id="box" style="width:${vp}px;${boxStyle}">${html}</div>`)
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
    // the fixture config narrows the contract's 19 viewports to 4: that is said, not silent
    expect(r.partial).toEqual([expect.stringMatching(/^viewports narrowed to 375,767,768,1024 \(the contract has 19\)/)])
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
    // narrowed to two viewports: never the wording of a full gate
    expect(p.stdout).toMatch(/gate: PARTIAL OK:/)
    expect(p.stdout).not.toMatch(/gate: OK/)
    expect(p.stdout).toMatch(/PARTIAL, not a parity result: viewports narrowed to 375,768/)
  }, 180_000)
})

describe('a narrowed or altered run never reads like the full gate (I2)', () => {
  it('names --blocks, --viewports, --legacy-css-on-new and skipped states in the summary', async () => {
    const s = setup('partial')
    const r = await go(s, 'gate', { viewports: [375] }, { blocks: ['PlainBlock'] })
    expect(r.ok).toBe(true)
    expect(r.partial.join(' | ')).toMatch(/viewports narrowed to 375/)
    expect(r.partial.join(' | ')).toMatch(/blocks narrowed to PlainBlock \(2 in the reference\)/)

    const identity = await go(s, 'gate', { viewports: [375], css: [] }, { blocks: ['PlainBlock'], legacyCssOnNew: true })
    expect(identity.partial.join(' | ')).toMatch(/legacy CSS loaded on the new side/)

    // a state the reference did not capture is skipped: the run passes but is partial
    const s2 = setup('partial-skipped', (ref) => {
      const f = join(ref, 'DemoBlock/demo-1/capture.json')
      const c = JSON.parse(readFileSync(f, 'utf8'))
      c.states.hover['768'].status = 'not-captured'
      writeFileSync(f, JSON.stringify(c))
    })
    const sk = await go(s2, 'gate', { viewports: [768] })
    expect(sk.totals.skipped).toBe(1)
    expect(sk.partial.join(' | ')).toMatch(/1 state\/viewport combination\(s\) skipped/)
  }, 300_000)

  it('zero comparisons fail the run', async () => {
    const s = setup('zero')
    const r = await go(s, 'gate', { viewports: [1440] }) // the fixture reference has no capture at 1440
    expect(r.totals.checks).toBe(0)
    expect(r.ok).toBe(false)
  }, 180_000)

  it('the CLI prints FAILED (partial run), not a full-gate line, for a narrowed failing run', () => {
    const s = setup('cli-partial-fail', (ref) => writeFileSync(join(ref, 'frontend.css'), readFileSync(join(ref, 'frontend.css'), 'utf8') + '\n.plain { padding-top: 7px; }\n'))
    const p = spawnSync('node', [join(pkg, 'dist/cli.js'), '--config', join(s.dir, 'parity.config.mjs'), '--mode', 'gate', '--viewports', '375', '--blocks', 'PlainBlock'], { cwd: s.dir, encoding: 'utf8', timeout: 120_000 })
    expect(p.status, p.stdout + p.stderr).toBe(1)
    expect(p.stdout).toMatch(/gate: FAILED \(partial run\):/)
  }, 180_000)
})

describe('the whole block is compared, not only its first root (I1)', () => {
  it('an extra sibling root that the legacy markup lacks fails', async () => {
    const s = setup('extra-root')
    const r = await go(s, 'gate', { blockMap: 'block-map.extra-root.ts', viewports: [375] })
    expect(r.ok).toBe(false)
    const f = failed(r)
    expect(keysOf(f)).toEqual(['DemoBlock'])
    expect(f.some((x) => x.comparison === 'frontend-vs-legacy')).toBe(true)
    expect(f.every((x) => /size differs/.test(x.message ?? ''))).toBe(true)
    // the extra root also shows in the style diff: an element the legacy side does not have
    expect(f.filter((x) => x.comparison === 'frontend-vs-legacy').every((x) => x.styleDiffs?.some((d) => d.property === '(element)' && d.a === 'missing'))).toBe(true)
  }, 180_000)

  it('two roots on both sides pass (control); two legacy roots against one new root fail', async () => {
    const twoLegacy = (ref: string) => writeFileSync(join(ref, 'PlainBlock/plain-1/outer.html'), '<div class="plain">Plain block text</div><div class="plain">Second root</div>\n')
    const s = setup('two-roots', twoLegacy)
    const same = await go(s, 'gate', { blockMap: 'block-map.two-roots.ts', viewports: [375, 768] })
    expect(failed(same), JSON.stringify(failed(same).map((x) => x.message))).toEqual([])
    expect(same.ok).toBe(true)
    const s2 = setup('two-roots-one-new', twoLegacy)
    const diff = await go(s2, 'gate', { viewports: [375] })
    expect(diff.ok).toBe(false)
    expect(keysOf(failed(diff))).toEqual(['PlainBlock'])
  }, 300_000)
})

describe('adapters get the legacy markup only in identity mode (M4)', () => {
  it('props() sees an empty legacyHtml in a normal run and the markup under --legacy-css-on-new', async () => {
    const s = setup('ctx')
    const normal = await go(s, 'gate', { blockMap: 'block-map.ctx.ts', viewports: [375] }, { blocks: ['PlainBlock'] })
    expect(failed(normal), JSON.stringify(failed(normal).map((x) => x.message))).toEqual([])
    const identity = await go(s, 'gate', { blockMap: 'block-map.ctx.ts', viewports: [375], css: [] }, { blocks: ['PlainBlock'], legacyCssOnNew: true })
    expect(failed(identity).length).toBeGreaterThan(0) // the adapter received the markup and rendered it: control that the flag works
  }, 300_000)
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

  it('break-it: a 1 px shift of the content still fails (the sub-pixel origin fit cannot absorb it)', async () => {
    const s = setup('validate-shift')
    await writeReferencePngs(s.reference)
    writeFileSync(join(s.reference, 'frontend.css'), readFileSync(join(s.reference, 'frontend.css'), 'utf8') + '\n.plain { text-indent: 1px; }\n')
    const r = await go(s, 'validate')
    expect(r.ok).toBe(false)
    expect(keysOf(failed(r))).toEqual(['PlainBlock'])
  }, 300_000)
})

describe('validate without backdrop inference; context gaps are listed, never passed (I3)', () => {
  // The reference PNGs were taken with a 50 % black block over a grey gradient; the legacy CSS now paints 20 %: a wrong
  // alpha. The removed backdrop inference accepted this; it must fail.
  const gradient = 'background:linear-gradient(90deg,#ddd,#777);'
  const mk = async (name: string) => {
    const s = setup(name, (ref) => writeFileSync(join(ref, 'frontend.css'), readFileSync(join(ref, 'frontend.css'), 'utf8') + '\n.plain { background: rgba(0, 0, 0, 0.5); }\n'))
    await writeReferencePngs(s.reference, gradient)
    writeFileSync(join(s.reference, 'frontend.css'), readFileSync(join(s.reference, 'frontend.css'), 'utf8') + '\n.plain { background: rgba(0, 0, 0, 0.2); }\n')
    return s
  }

  it('a wrong translucent colour over a gradient fails validate', async () => {
    const s = await mk('validate-backdrop')
    const r = await go(s, 'validate')
    expect(r.ok).toBe(false)
    expect(keysOf(failed(r))).toEqual(['PlainBlock'])
    expect(failed(r).length).toBe(VPS.length)
    expect(r.totals.contextGap).toBe(0)
  }, 300_000)

  it('listed in validateContextGaps it is reported as a context gap with its reason, not as a pass', async () => {
    const s = await mk('validate-gap')
    writeFileSync(
      join(s.dir, 'validate-context-gaps.json'),
      JSON.stringify({ 'PlainBlock/plain-1': { reason: 'translucent block over an ancestor gradient that the excerpt lacks' }, 'DemoBlock/demo-1': { reason: 'not needed' } }),
    )
    const r = await go(s, 'validate', { validateContextGaps: 'validate-context-gaps.json' })
    expect(failed(r)).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.totals.contextGap).toBe(VPS.length)
    expect(r.totals.pass).toBe(r.results.length - VPS.length) // context gaps are not counted as passes
    const gaps = r.results.filter((x) => x.status === 'context-gap')
    expect(gaps.every((x) => x.key === 'PlainBlock' && /translucent block over an ancestor gradient/.test(x.message ?? ''))).toBe(true)
    expect(r.unusedContextGaps).toEqual(['DemoBlock/demo-1'])

    // limited to some viewports: the others fail
    writeFileSync(join(s.dir, 'validate-context-gaps.json'), JSON.stringify({ 'PlainBlock/plain-1': { viewports: [375], reason: 'x' } }))
    const some = await go(s, 'validate', { validateContextGaps: 'validate-context-gaps.json' })
    expect(some.ok).toBe(false)
    expect(some.totals.contextGap).toBe(1)
    expect(failed(some).length).toBe(VPS.length - 1)
  }, 400_000)

  it('the gate never reads the file and is not excused by it', async () => {
    const s = setup('gate-gap', (ref) => writeFileSync(join(ref, 'frontend.css'), readFileSync(join(ref, 'frontend.css'), 'utf8') + '\n.plain { padding-top: 7px; }\n'))
    writeFileSync(join(s.dir, 'broken-gaps.json'), '{ this is not json')
    const r = await go(s, 'gate', { validateContextGaps: 'broken-gaps.json', viewports: [375] }) // would throw if it were read
    expect(r.ok).toBe(false)
    expect(keysOf(failed(r))).toEqual(['PlainBlock'])
    writeFileSync(join(s.dir, 'gaps.json'), JSON.stringify({ 'PlainBlock/plain-1': { reason: 'would excuse it in validate' } }))
    const again = await go(s, 'gate', { validateContextGaps: 'gaps.json', viewports: [375] })
    expect(again.ok).toBe(false)
    expect(again.totals.contextGap).toBe(0)
  }, 300_000)

  it('rejects an entry without a reason and one for an unknown instance', async () => {
    const s = setup('gap-invalid')
    writeFileSync(join(s.dir, 'g.json'), JSON.stringify({ 'PlainBlock/plain-1': {} }))
    await expect(go(s, 'validate', { validateContextGaps: 'g.json' })).rejects.toThrow(/needs a non-empty "reason"/)
    writeFileSync(join(s.dir, 'g.json'), JSON.stringify({ 'PlainBlock/nope': { reason: 'x' } }))
    await expect(go(s, 'validate', { validateContextGaps: 'g.json' })).rejects.toThrow(/unknown instance PlainBlock\/nope/)
  })
})

describe('edge report at a scrollbar width, informational (M1)', () => {
  it('reports each breakpoint edge at both sides without touching the verdict', async () => {
    const s = setup('edge-report')
    const r = await go(s, 'gate', {}, { edgeReport: true })
    expect(r.ok).toBe(true) // the verdict pass runs without a scrollbar
    expect(r.scrollbar).toBe(0)
    const e = r.edgeReport!
    expect(e.scrollbar).toBe(15)
    expect(e.differ).toBeGreaterThan(0)
    const row = e.rows.find((x) => x.key === 'DemoBlock' && x.comparison === 'frontend-vs-legacy' && x.edge === '767/768')!
    expect([row.a, row.b]).toEqual(['pass', 'FAIL'])
    expect(failed(r)).toEqual([])
    // off unless asked for
    const plain = await go(s, 'gate', { viewports: [768] }, { blocks: ['DemoBlock'] })
    expect(plain.edgeReport).toBeUndefined()
  }, 400_000)
})

describe('report directory guard (M5)', () => {
  it('refuses a report dir that is or contains the cwd, the config or the reference, and a foreign non-empty dir', async () => {
    const s = setup('report-guard')
    writeFileSync(join(s.dir, 'keep.txt'), 'x')
    await expect(go(s, 'gate', { reportDir: s.dir })).rejects.toThrow(/is or contains the working directory/)
    await expect(go(s, 'gate', { reportDir: dirname(s.dir) })).rejects.toThrow(/is or contains/)
    await expect(go(s, 'gate', { reportDir: s.reference })).rejects.toThrow(/is or contains/)
    mkdirSync(join(s.dir, 'foreign'))
    writeFileSync(join(s.dir, 'foreign', 'mine.txt'), 'x')
    await expect(go(s, 'gate', { reportDir: join(s.dir, 'foreign') })).rejects.toThrow(/holds no summary.json/)
    expect(existsSync(join(s.dir, 'keep.txt'))).toBe(true)
    expect(existsSync(join(s.dir, 'foreign', 'mine.txt'))).toBe(true)
    expect(existsSync(join(s.reference, 'DemoBlock'))).toBe(true)
  }, 120_000)

  it('control: a previous report dir (with summary.json) is cleared and reused', async () => {
    const s = setup('report-reuse')
    const old = join(s.dir, 'old-report')
    mkdirSync(old)
    writeFileSync(join(old, 'summary.json'), '{}')
    writeFileSync(join(old, 'stale.txt'), 'x')
    await go(s, 'gate', { reportDir: old, viewports: [375] }, { blocks: ['PlainBlock'] })
    expect(existsSync(join(old, 'stale.txt'))).toBe(false)
    expect(existsSync(join(old, 'summary.json'))).toBe(true)

    // a run that died before it wrote summary.json leaves only the marker and img/: the next run may clear it
    const crashed = join(s.dir, 'crashed-report')
    mkdirSync(join(crashed, 'img'), { recursive: true })
    writeFileSync(join(crashed, '.parity-report'), 'x')
    writeFileSync(join(crashed, 'img', '0001.png'), 'x')
    await go(s, 'gate', { reportDir: crashed, viewports: [375] }, { blocks: ['PlainBlock'] })
    expect(existsSync(join(crashed, 'img', '0001.png'))).toBe(false)
    expect(existsSync(join(crashed, 'summary.json'))).toBe(true)
  }, 180_000)
})

describe('dev server file access (M6)', () => {
  it('serves the block map and reference, refuses a file outside the allow-list', async () => {
    const s = setup('fs')
    const secret = join(work, 'secret.txt')
    writeFileSync(secret, 'TOPSECRET')
    const server = await startServer({ reference: s.reference, cwd: s.dir, blockMap: join(s.dir, 'block-map.ts'), css: [join(s.dir, 'theme.css')] })
    try {
      const bad = await fetch(`${server.origin}/@fs${secret}`)
      expect(bad.status).toBe(403)
      expect(await bad.text()).not.toContain('TOPSECRET')
      expect((await fetch(`${server.origin}/@fs${join(s.dir, 'block-map.ts')}`)).status).toBe(200)
    } finally {
      await server.close()
    }
  }, 60_000)
})

describe('background images (M7)', () => {
  it('BG_DONE waits for a slow CSS background image and names one that fails', async () => {
    const http = createServer((req, res) => {
      if (req.url === '/blank') return void (res.setHeader('content-type', 'text/html'), res.end('<!doctype html><body></body>'))
      if (req.url === '/slow.png') return void setTimeout(() => { res.setHeader('content-type', 'image/png'); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')) }, 900)
      res.statusCode = 404
      res.end('no')
    })
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    const origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      // inserted after load, so that the page's load event does not wait for the image
      await page.goto(`${origin}/blank`)
      await page.evaluate((o) => { document.body.innerHTML = `<div id="parity-page"><div style="width:10px;height:10px;background-image:url(${o}/slow.png)"></div></div>` }, origin)
      const t0 = Date.now()
      const failedUrls = await page.evaluate(BG_DONE)
      expect(Date.now() - t0).toBeGreaterThan(700) // it waited for the image
      expect(failedUrls).toEqual([])
      // control: a background image that 404s is named
      await page.evaluate((o) => { document.body.innerHTML = `<div id="parity-page"><div style="width:10px;height:10px;background-image:url(${o}/missing.png)"></div></div>` }, origin)
      expect(await page.evaluate(BG_DONE)).toEqual([`${origin}/missing.png`])
    } finally {
      await browser.close()
      http.close()
    }
  }, 60_000)
})
