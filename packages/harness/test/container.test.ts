import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { run } from '../src/run.js'
import type { CheckResult, ParityConfig, RunSummary } from '../src/types.js'

// Container mode on a synthetic neutral fixture (test/fixture/container): two container blocks whose legacy markup holds
// a foreign child (a block with no implementation), plus a pilot child. No client data.
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const work = join(root, '.tmp', 'parity-test-container')
const VPS = [375, 767, 768, 1024]

interface Setup {
  dir: string
  reference: string
}

const setup = (name: string, mutate?: (dir: string) => void): Setup => {
  const dir = join(work, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  cpSync(join(here, 'fixture', 'container'), dir, { recursive: true })
  mutate?.(dir)
  return { dir, reference: join(dir, 'reference') }
}

/** Replace text in a fixture file and fail loudly when it was not there (a silent no-op would make a break-it green). */
const edit = (dir: string, file: string, from: string, to: string) => {
  const f = join(dir, file)
  const s = readFileSync(f, 'utf8')
  if (!s.includes(from)) throw new Error(`break-it is a no-op: ${file} does not contain ${JSON.stringify(from)}`)
  writeFileSync(f, s.replace(from, to))
}

// Consumer decision: the panel's foreign children are every `.alien`; the grid's are the children of its fixture whose
// block is not in the block map (the function form).
const containers: NonNullable<ParityConfig['containers']> = {
  PanelBlock: {
    foreign: (fx: any, ctx) => fx.node.children.filter((c: any) => !ctx.implemented.includes(c.block)).map((c: any) => ({ id: c.id, selector: c.id === 'media' ? '.alien--media' : '.alien--text' })),
  },
  GridBlock: {
    foreign: (fx: any, ctx) => fx.node.children.filter((c: any) => !ctx.implemented.includes(c.block)).map((c: any) => ({ id: c.id, selector: c.selector })),
  },
}

const cfg = (s: Setup, over: Partial<ParityConfig> = {}): ParityConfig => ({
  reference: 'reference',
  blockMap: 'block-map.ts',
  css: ['theme.css'],
  theme: 'neutral',
  viewports: VPS,
  reportDir: join(s.dir, 'report'),
  containers,
  ...over,
})

const go = (s: Setup, over: Partial<ParityConfig> = {}, extra: Record<string, unknown> = {}, mode: 'gate' | 'validate' = 'gate') =>
  run({ mode, config: cfg(s, over), configDir: s.dir, cwd: s.dir, concurrency: 2, ...extra })

const failed = (r: RunSummary) => r.results.filter((x) => x.status === 'fail')
const front = (r: RunSummary, key?: string) => r.results.filter((x) => x.comparison === 'frontend-vs-legacy' && (!key || x.key === key))
const box = (r: CheckResult, id: string) => (r as any).container?.replaced.find((b: any) => b.id === id)

beforeAll(() => rmSync(work, { recursive: true, force: true }))
afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('container mode: a foreign child does not make the instance fail, the frame is still compared', () => {
  it('passes when the new render reproduces the frame and uses the placeholders; the report names the replaced children and their boxes', async () => {
    const s = setup('ok')
    const r = await go(s)
    expect(failed(r), JSON.stringify(failed(r).map((x) => [x.key, x.viewport, x.comparison, x.message]))).toEqual([])
    expect(r.ok).toBe(true)
    // every comparison of a container block carries the boxes that were replaced
    for (const key of ['PanelBlock', 'GridBlock']) {
      const rs = r.results.filter((x) => x.key === key)
      expect(rs.length).toBe(VPS.length * 2)
      for (const x of rs) expect((x as any).container?.replaced.length, `${key} @${x.viewport}`).toBe(key === 'PanelBlock' ? 2 : 1)
    }
    const panel = (vp: number) => front(r, 'PanelBlock').find((x) => x.viewport === vp)!
    expect(box(panel(375), 'media')).toMatchObject({ id: 'media', index: 0, height: 144 })
    expect(box(panel(375), 'text').index).toBe(1)
    // the boxes are the legacy sizes at that viewport: the foreign text is taller on the narrow page
    expect(box(panel(375), 'text').height).toBeGreaterThan(box(panel(1024), 'text').height)
    expect(box(panel(375), 'text').width).toBeLessThan(box(panel(1024), 'text').width)
    // a non-container block in the same run is untouched
    for (const x of r.results.filter((x) => x.key === 'PlainBlock')) expect((x as any).container).toBeUndefined()
    expect(r.results.filter((x) => x.key === 'PlainBlock').length).toBe(VPS.length * 2)
    // written to summary.json and to the HTML report
    const summary = JSON.parse(readFileSync(join(s.dir, 'report', 'summary.json'), 'utf8'))
    expect(summary.results.find((x: any) => x.key === 'GridBlock').container.replaced[0]).toMatchObject({ id: 'a', selector: '.grid__col--a > .alien' })
    expect(readFileSync(join(s.dir, 'report', 'index.html'), 'utf8')).toMatch(/<h2>Container mode<\/h2>/)
  }, 240_000)

  it('control: without container mode configured the same instances fail as before', async () => {
    const s = setup('control')
    const r = await go(s, { containers: undefined })
    const f = front(r).filter((x) => x.status === 'fail')
    expect(new Set(f.map((x) => x.key))).toEqual(new Set(['PanelBlock', 'GridBlock']))
    expect(f.length).toBe(VPS.length * 2)
    for (const x of f) expect((x as any).container).toBeUndefined()
    expect(front(r, 'PlainBlock').every((x) => x.status === 'pass')).toBe(true)
  }, 240_000)
})

describe('container mode: break-its, each must fail', () => {
  const only = (r: RunSummary, key: string) => {
    const f = failed(r).filter((x) => x.comparison === 'frontend-vs-legacy')
    expect(new Set(f.map((x) => x.key)), JSON.stringify(f.map((x) => [x.key, x.viewport, x.message]))).toEqual(new Set([key]))
    expect(r.ok).toBe(false)
    return f
  }

  it('(a) wrong gutter in the new grid', async () => {
    const s = setup('a-gutter', (d) => edit(d, 'blocks/GridBlock.vue', 'gap: 24px', 'gap: 32px'))
    const f = only(await go(s, {}, { blocks: ['GridBlock'] }), 'GridBlock')
    expect(f.length).toBeGreaterThan(0)
  }, 240_000)

  it('(a) wrong column width in the new grid', async () => {
    const s = setup('a-column', (d) => edit(d, 'blocks/GridBlock.vue', 'flex-grow: 2', 'flex-grow: 3'))
    const f = only(await go(s, {}, { blocks: ['GridBlock'] }), 'GridBlock')
    // the wide layouts (768 and up) carry the changed column ratio
    expect(f.map((x) => x.viewport)).toEqual(expect.arrayContaining([768, 1024]))
  }, 240_000)

  it('(b) wrong padding in the new card', async () => {
    const s = setup('b-padding', (d) => edit(d, 'blocks/PanelBlock.vue', 'padding: 12px 16px', 'padding: 16px 16px'))
    const f = only(await go(s, {}, { blocks: ['PanelBlock'] }), 'PanelBlock')
    expect(f.length).toBe(VPS.length)
    for (const x of f) expect(x.message).toMatch(/size differs/)
  }, 240_000)

  it('(c) a placeholder 30 px too short on the new side', async () => {
    const s = setup('c-big')
    const r = await go(s, { blockMap: 'block-map.wrong-size-big.ts' }, { blocks: ['PanelBlock', 'GridBlock'] })
    const f = failed(r).filter((x) => x.comparison === 'frontend-vs-legacy')
    expect(new Set(f.map((x) => x.key))).toEqual(new Set(['PanelBlock', 'GridBlock']))
    expect(f.length).toBe(VPS.length * 2)
    expect(f.every((x) => /placeholder/.test(x.message ?? ''))).toBe(true)
  }, 240_000)

  it('(c) a placeholder one pixel too short is caught by the size check even where the pixels stay under the tolerance', async () => {
    const s = setup('c-small')
    const r = await go(s, { blockMap: 'block-map.wrong-size.ts' }, { blocks: ['PanelBlock'] })
    const f = failed(r).filter((x) => x.comparison === 'frontend-vs-legacy')
    expect(f.length).toBeGreaterThan(0)
    expect(f.some((x) => /placeholder \d+ \(\w+\) is [\d.]+x[\d.]+ in the new render, measured [\d.]+x[\d.]+ in the legacy render/.test(x.message ?? ''))).toBe(true)
  }, 240_000)

  it('(c) an adapter that ignores the placeholders fails: they are missing in the new render', async () => {
    const s = setup('c-missing')
    const r = await go(s, { blockMap: 'block-map.no-placeholder.ts' }, { blocks: ['PanelBlock'] })
    const f = failed(r).filter((x) => x.comparison === 'frontend-vs-legacy')
    expect(f.length).toBe(VPS.length)
    for (const x of f) expect(x.message).toMatch(/placeholder 0 \(media\) is missing in the new render/)
  }, 240_000)

  it('(d) the foreign child is taller in legacy and pushes the pilot child down: a new render that misplaces the pilot child fails', async () => {
    const s = setup('d-shift', (d) => edit(d, 'blocks/PanelBlock.vue', '.blk-pilot--after { margin-top: 10px; }', '.blk-pilot--after { margin-top: 0; }'))
    const r = await go(s, {}, { blocks: ['PanelBlock'] })
    const f = only(r, 'PanelBlock')
    // the foreign text wraps on the narrow page and is much taller there (the placeholder took that legacy height)
    const at = (vp: number) => front(r, 'PanelBlock').find((x) => x.viewport === vp)!
    expect(box(at(375), 'text').height).toBeGreaterThan(box(at(1024), 'text').height + 20)
    expect(f.map((x) => x.viewport).sort((a, b) => a - b)).toEqual(VPS)
  }, 240_000)
})

describe('container mode: scope and configuration', () => {
  it('validate mode leaves the legacy render alone: the raw legacy markup still matches the reference screenshots', async () => {
    const s = setup('validate')
    const browser = await chromium.launch()
    try {
      for (const [key, inst] of [['PanelBlock', 'panel-1'], ['GridBlock', 'grid-1'], ['PlainBlock', 'plain-1']]) {
        const dir = join(s.reference, key, inst)
        const css = readFileSync(join(s.reference, 'frontend.css'), 'utf8')
        const html = readFileSync(join(dir, 'outer.html'), 'utf8')
        for (const vp of VPS) {
          const page = await browser.newPage({ viewport: { width: vp, height: 2800 }, deviceScaleFactor: 1 })
          await page.setContent(`<!doctype html><style>${css}</style><div id="box" style="width:${vp}px">${html}</div>`)
          writeFileSync(join(dir, `${vp}.png`), await page.locator('#box > *').first().screenshot({ animations: 'disabled', scale: 'css' }))
          await page.close()
        }
      }
    } finally {
      await browser.close()
    }
    const r = await go(s, {}, {}, 'validate')
    expect(failed(r), JSON.stringify(failed(r).map((x) => x.message))).toEqual([])
    expect(r.results.length).toBe(VPS.length * 3)
    for (const x of r.results) expect((x as any).container).toBeUndefined()
  }, 240_000)

  it('an unknown key in the container config is an error', async () => {
    const s = setup('unknown-key')
    await expect(go(s, { containers: { NoSuchBlock: { foreign: ['.alien'] } } })).rejects.toThrow(/container mode for unknown block NoSuchBlock/)
  }, 60_000)

  it('a selector that matches nothing in the legacy render is an error, not a silent pass', async () => {
    const s = setup('no-match')
    await expect(go(s, { containers: { PanelBlock: { foreign: ['.alien--media', '.does-not-exist'] } } }, { blocks: ['PanelBlock'] })).rejects.toThrow(/\.does-not-exist.*matched no element/)
  }, 120_000)

  it('the block root cannot be a foreign child', async () => {
    const s = setup('root')
    await expect(go(s, { containers: { PanelBlock: { foreign: ['.panel'] } } }, { blocks: ['PanelBlock'] })).rejects.toThrow(/root of the block/)
  }, 120_000)

  it('nested matches: only the outermost element is replaced, bare selectors are their own id', async () => {
    const s = setup('nested')
    const r = await go(s, { containers: { PanelBlock: { foreign: ['.panel__body', '.alien--text'] } } }, { blocks: ['PanelBlock'], viewports: [375] })
    const x = front(r, 'PanelBlock')[0] as any
    expect(x.container.replaced.map((b: any) => b.id)).toEqual(['.panel__body'])
  }, 120_000)

  it('identity mode (--legacy-css-on-new) does not use container mode', async () => {
    const s = setup('identity')
    const r = await go(s, {}, { blocks: ['PanelBlock'], viewports: [375], legacyCssOnNew: true })
    for (const x of r.results) expect((x as any).container).toBeUndefined()
  }, 120_000)
})
