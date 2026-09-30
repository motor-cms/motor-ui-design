import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { DEFAULT_VIEWPORTS, DEFAULT_VIEWPORT_HEIGHT, EDGES, RenderError, edgeOf, newContext, render, type BrowserOptions, type Rendered } from './browser.js'
import { TOLERANCE, comparePng, diffStyles, type PixelResult } from './compare.js'
import { inferOrigin, listInstances, originCandidates, listKeys, pngName, pngSize, type InstanceInfo } from './pack.js'
import { edgeTable, writeReport } from './report.js'
import { startServer } from './server.js'
import type { CheckResult, Comparison, ContextGaps, EdgeReport, Exemptions, MissingResult, Mode, ParityConfig, RunSummary, SkippedResult } from './types.js'

export interface RunOptions {
  mode: Mode
  config: ParityConfig
  /** directory relative config paths resolve against */
  configDir: string
  cwd: string
  /** the config file itself (a report dir must not contain it) */
  configFile?: string
  reference?: string
  blocks?: string[]
  theme?: string
  viewports?: number[]
  reportDir?: string
  scrollbar?: number
  /** load the legacy CSS on /frontend and /builder as well (identity fixtures, Review Focus 3) */
  legacyCssOnNew?: boolean
  concurrency?: number
  /** gate: after the verdict pass, an informational pass at scrollbar EDGE_SCROLLBAR over the breakpoint-edge viewports */
  edgeReport?: boolean
  log?: (m: string) => void
}

const abs = (base: string, p: string) => (isAbsolute(p) ? p : resolve(base, p))

/** Scrollbar width of the informational edge pass (a classic scrollbar, Review Focus 1). */
export const EDGE_SCROLLBAR = 15

const REPORT_MARKER = '.parity-report'

const real = (p: string) => {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}
const contains = (outer: string, inner: string) => inner === outer || inner.startsWith(outer.endsWith(sep) ? outer : outer + sep)

/**
 * The report directory is wiped before a run. Refuse one that is, or contains, the working directory, the config, the
 * reference pack or a file the run reads; only wipe a directory that is empty or already holds a summary.json.
 */
export const prepareReportDir = (reportDir: string, protect: { label: string; path: string }[]) => {
  const dir = real(reportDir)
  for (const { label, path } of protect) {
    if (contains(dir, real(path))) throw new Error(`refusing to use ${reportDir} as the report directory: it is or contains ${label} (${path})`)
  }
  if (existsSync(dir)) {
    const entries = readdirSync(dir)
    // A previous report holds summary.json; a run that died before writing it left the marker the harness puts first.
    if (entries.length && !entries.includes('summary.json') && !entries.includes(REPORT_MARKER)) {
      throw new Error(`refusing to clear ${reportDir}: it is not empty and holds no summary.json, so it is not a previous report directory`)
    }
  }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'img'), { recursive: true })
  writeFileSync(join(dir, REPORT_MARKER), 'created by motor-ui-parity; the directory is wiped at the start of every run\n')
}

export const loadContextGaps = (file: string): ContextGaps => {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${file}: context gaps must be an object keyed by "<Key>/<instance>"`)
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    if (!/^[^/]+\/[^/]+$/.test(k)) throw new Error(`${file}: "${k}" must be "<Key>/<instance>"`)
    if (!v || typeof v.reason !== 'string' || !v.reason.trim()) throw new Error(`${file}: context gap for ${k} needs a non-empty "reason"`)
    if (v.viewports !== undefined && (!Array.isArray(v.viewports) || v.viewports.some((n: unknown) => typeof n !== 'number'))) {
      throw new Error(`${file}: context gap for ${k}: "viewports" must be a list of numbers`)
    }
  }
  return raw as ContextGaps
}

export const loadExemptions = (file: string | undefined): Exemptions => {
  if (!file || !existsSync(file)) return {}
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${file}: exemptions must be an object keyed by block key`)
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v.reason !== 'string' || !v.reason.trim()) throw new Error(`${file}: exemption for ${k} needs a non-empty "reason"`)
    if (v.viewports !== undefined && (!Array.isArray(v.viewports) || v.viewports.some((n: unknown) => typeof n !== 'number'))) {
      throw new Error(`${file}: exemption for ${k}: "viewports" must be a list of numbers`)
    }
  }
  return raw as Exemptions
}

const pool = async <T>(items: T[], n: number, fn: (x: T) => Promise<void>) => {
  const queue = [...items]
  const errors: unknown[] = []
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (queue.length && !errors.length) {
        const x = queue.shift()!
        try {
          await fn(x)
        } catch (e) {
          errors.push(e)
        }
      }
    }),
  )
  if (errors.length) throw errors[0]
}

export const run = async (opts: RunOptions): Promise<RunSummary> => {
  const t0 = Date.now()
  const log = opts.log ?? (() => undefined)
  const cfg = opts.config
  const reference = abs(opts.reference ? opts.cwd : opts.configDir, opts.reference ?? cfg.reference ?? 'reference')
  if (!existsSync(reference)) throw new Error(`reference directory ${reference} does not exist`)
  const theme = opts.theme ?? cfg.theme ?? 'default'
  const viewports = opts.viewports ?? cfg.viewports ?? DEFAULT_VIEWPORTS
  const viewportHeight = cfg.viewportHeight ?? DEFAULT_VIEWPORT_HEIGHT
  const scrollbar = opts.scrollbar ?? 0
  const reportDir = abs(opts.reportDir ? opts.cwd : opts.configDir, opts.reportDir ?? cfg.reportDir ?? 'report')
  const contextGapsFile = opts.mode === 'validate' && cfg.validateContextGaps ? abs(opts.configDir, cfg.validateContextGaps) : undefined
  const contextGaps: ContextGaps = contextGapsFile ? loadContextGaps(contextGapsFile) : {}
  const usedGaps = new Set<string>()
  const exemptionsFile = cfg.exemptions ? abs(opts.configDir, cfg.exemptions) : join(opts.configDir, 'exemptions.json')
  const exemptions = opts.mode === 'gate' ? loadExemptions(exemptionsFile) : {}
  const blockMapFile = cfg.blockMap ? abs(opts.configDir, cfg.blockMap) : undefined
  const cssFiles = (cfg.css ?? []).map((f) => abs(opts.configDir, f))
  for (const f of [...cssFiles, ...(blockMapFile ? [blockMapFile] : [])]) if (!existsSync(f)) throw new Error(`configured file ${f} does not exist`)

  const allKeys = listKeys(reference)
  const keys = opts.blocks?.length ? opts.blocks : allKeys
  for (const k of keys) if (!allKeys.includes(k)) throw new Error(`block ${k} is not in the reference (${allKeys.join(', ')})`)
  for (const k of Object.keys(exemptions)) if (!allKeys.includes(k)) throw new Error(`${exemptionsFile}: exemption for unknown block ${k}`)
  for (const k of Object.keys(contextGaps)) if (!existsSync(join(reference, k))) throw new Error(`${contextGapsFile}: context gap for unknown instance ${k}`)

  // Which keys have a new implementation (gate). The block map module is read through Vite, so ask the server side
  // through a tiny probe page instead of importing it here: the harness stays free of the consumer's toolchain.
  prepareReportDir(reportDir, [
    { label: 'the working directory', path: opts.cwd },
    { label: 'the config directory', path: opts.configDir },
    ...(opts.configFile ? [{ label: 'the config file', path: opts.configFile }] : []),
    { label: 'the reference pack', path: reference },
    ...(blockMapFile ? [{ label: 'the block map', path: blockMapFile }] : []),
    ...cssFiles.map((f) => ({ label: 'a configured CSS file', path: f })),
  ])

  const server = await startServer({ reference, cwd: opts.cwd, blockMap: blockMapFile, css: cssFiles, legacyCss: cfg.legacyCss, vitePlugins: cfg.vitePlugins, fsAllow: (cfg.fsAllow ?? []).map((f) => abs(opts.configDir, f)) })
  const browser = await chromium.launch()
  let results: CheckResult[] = []
  let skipped: SkippedResult[] = []
  const missing: MissingResult[] = []
  let imgCount = 0
  let keepImages = true
  let edge: EdgeReport | undefined
  try {
    const bo: BrowserOptions = { origin: server.origin, reference, fonts: cfg.fonts ?? [], assetOrigin: cfg.assetOrigin ?? /^https?:\/\/[^/]*\.test(:\d+)?$/, viewportHeight }

    // Block map inventory: which implementations exist, per key.
    const inventory: Record<string, { frontend: boolean; builder: boolean }> = {}
    if (opts.mode === 'gate') {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(`${server.origin}/inventory`, { waitUntil: 'load' })
      await page.waitForFunction(() => (window as any).__parityReady || (window as any).__parityError, undefined, { timeout: 60_000 })
      const err = await page.evaluate(() => (window as any).__parityError as string | undefined)
      if (err) throw new Error(`block map could not be loaded: ${err}`)
      const inv = (await page.evaluate(() => (window as any).__parityInventory)) as Record<string, { frontend: boolean; builder: boolean; props: boolean }>
      await ctx.close()
      Object.assign(inventory, inv)
      for (const k of keys) {
        if (!inventory[k]?.frontend) missing.push({ key: k, what: 'frontend' })
        if (!inventory[k]?.builder) missing.push({ key: k, what: 'builder' })
      }
    }

    const save = (name: string, buf: Buffer | undefined) => {
      if (!buf || !keepImages) return undefined
      const file = `img/${String(++imgCount).padStart(4, '0')}-${name}.png`
      writeFileSync(join(reportDir, file), buf)
      return file
    }

    const record = (r: Omit<CheckResult, 'edge'>, pix?: PixelResult, expected?: Buffer, actual?: Buffer) => {
      const full: CheckResult = { ...r }
      if (r.status !== 'pass') {
        const tag = `${r.key}-${r.instance.slice(-8)}-${r.viewport}-${r.state}`
        full.images = { expected: save(`${tag}-expected`, expected), actual: save(`${tag}-actual`, actual), diff: save(`${tag}-diff`, pix?.diffPng) }
      }
      results.push(full)
    }

    const judge = (
      comparison: Comparison,
      inst: InstanceInfo,
      vp: number,
      state: string,
      expected: Buffer,
      actual: Buffer,
      styleDiffs?: ReturnType<typeof diffStyles>,
      origin?: [number, number],
    ) => {
      const pix = comparePng(expected, actual)
      const base = { comparison, key: inst.key, instance: inst.instance, viewport: vp, state }
      const originInfo = origin ? { origin } : {}
      const styleInfo = styleDiffs ? { styleDiffs: styleDiffs.slice(0, 200), styleDiffCount: styleDiffs.length } : {}
      const num = { ...originInfo, diffPixels: pix.diffPixels, totalPixels: pix.totalPixels, ratio: pix.ratio, sizeA: pix.sizeA, sizeB: pix.sizeB }
      if (pix.ok) return record({ ...base, status: 'pass', ...num, ...styleInfo })
      const ex = comparison === 'builder-vs-frontend' ? exemptions[inst.key] : undefined
      const message = pix.sameSize
        ? `${pix.diffPixels} of ${pix.totalPixels} pixels differ (${(pix.ratio * 100).toFixed(3)} %, limit ${(TOLERANCE.maxDiffPixelRatio * 100).toFixed(1)} %)`
        : `size differs: ${comparison === 'builder-vs-frontend' ? 'builder' : comparison === 'frontend-vs-legacy' ? 'frontend' : 'legacy render'} ${pix.sizeB.join('x')} vs ${pix.sizeA.join('x')}`
      // validate only: a listed instance/viewport whose reference holds page context the excerpt lacks
      const gapKey = `${inst.key}/${inst.instance}`
      const gap = comparison === 'reference-vs-legacy' ? contextGaps[gapKey] : undefined
      if (gap && (!gap.viewports || gap.viewports.includes(vp))) {
        usedGaps.add(gapKey)
        return record({ ...base, status: 'context-gap', message: `${message}; context gap: ${gap.reason}`, ...num, ...styleInfo }, pix, expected, actual)
      }
      if (ex && (!ex.viewports || ex.viewports.includes(vp))) {
        return record({ ...base, status: 'exempt', message: `${message}; exempt: ${ex.reason}`, ...num, ...styleInfo }, pix, expected, actual)
      }
      record({ ...base, status: 'fail', message, ...num, ...styleInfo }, pix, expected, actual)
    }

    type Job = { inst: InstanceInfo; vp: number }
    // One pass over the pack at a scrollbar width. The verdict pass is the one at `scrollbar`; the edge pass is informational.
    const doPass = async (scrollbar: number, vps: number[], wantStyles: boolean) => {
    const jobs: Job[] = []
    for (const k of keys) {
      for (const inst of listInstances(reference, k)) {
        if (opts.mode === 'gate' && !inventory[k]?.frontend) continue
        for (const vp of vps) jobs.push({ inst, vp })
      }
    }
    log(`${opts.mode}: ${jobs.length} instance/viewport jobs at scrollbar ${scrollbar}px, ${keys.length} block(s), server ${server.origin}`)

    await pool(jobs, opts.concurrency ?? 4, async ({ inst, vp }) => {
      // states the reference captured at this viewport
      const states: string[] = []
      const widths: Record<string, number | undefined> = {}
      for (const st of inst.states) {
        const c = inst.capture[st]?.[String(vp)]
        if (c?.status === 'captured') {
          states.push(st)
          widths[st] = c.width
        } else skipped.push({ key: inst.key, instance: inst.instance, viewport: vp, state: st, reason: c ? `not captured in the reference: ${c.status}` : 'no capture entry' })
      }
      if (!states.length) return
      const cap0 = inst.capture[states[0]][String(vp)]
      // The reference PNG's size tells the element's sub-pixel origin; a pack without PNGs renders at whole pixels.
      const pngFile = join(inst.dir, pngName(vp, states[0]))
      const origin: [number, number] = existsSync(pngFile) ? inferOrigin(pngSize(pngFile), cap0) : [0, 0]
      const problems: string[] = []
      const ctx = await newContext(browser, vp, bo, problems)
      try {
        const spec = (route: 'legacy' | 'frontend' | 'builder', st: string[]) => ({
          route,
          key: inst.key,
          instance: inst.instance,
          viewport: vp,
          width: widths[st[0]],
          theme,
          scrollbar,
          origin,
          legacyCss: route !== 'legacy' && !!opts.legacyCssOnNew,
          states: st,
          wantStyles: opts.mode === 'gate' && wantStyles,
        })
        // A state's box width may differ per state (it does not today); render each distinct width once.
        const groups = new Map<number | undefined, string[]>()
        for (const st of states) groups.set(widths[st], [...(groups.get(widths[st]) ?? []), st])

        for (const [, st] of groups) {
          // Validate: the element's sub-pixel origin on the captured page is not recorded; find the one (eighth
          // pixels, consistent with the PNG size) at which the legacy render matches best, and report it.
          const fit =
            opts.mode === 'validate'
              ? {
                  candidates: originCandidates(pngSize(join(inst.dir, pngName(vp, st[0]))), inst.capture[st[0]][String(vp)]),
                  score: (png: Buffer) => {
                    const c = comparePng(readFileSync(join(inst.dir, pngName(vp, st[0]))), png)
                    return c.sameSize ? c.diffPixels : Number.MAX_SAFE_INTEGER
                  },
                }
              : undefined
          const legacy = await render(ctx, problems, bo, spec('legacy', st), fit)
          if (opts.mode === 'validate') {
            for (const s of st) {
              const r = legacy.states[s]
              const f = join(inst.dir, pngName(vp, s))
              if ('error' in r) {
                record({ comparison: 'reference-vs-legacy', key: inst.key, instance: inst.instance, viewport: vp, state: s, status: 'fail', message: r.error })
                continue
              }
              judge('reference-vs-legacy', inst, vp, s, readFileSync(f), r.png, undefined, legacy.origin)
            }
            continue
          }
          const side = async (route: 'frontend' | 'builder'): Promise<Rendered | string> => {
            if (route === 'builder' && !inventory[inst.key]?.builder) return 'no builder implementation'
            try {
              return await render(ctx, problems, bo, spec(route, st))
            } catch (e) {
              if (e instanceof RenderError) return e.message
              throw e
            }
          }
          const front = await side('frontend')
          const build = await side('builder')
          const failAll = (comparison: Comparison, msg: string) => {
            for (const s of st) record({ comparison, key: inst.key, instance: inst.instance, viewport: vp, state: s, status: 'fail', message: msg })
          }
          if (typeof front === 'string') failAll('frontend-vs-legacy', front)
          else {
            for (const s of st) {
              const a = legacy.states[s]
              const b = front.states[s]
              if ('error' in a) throw new RenderError(`legacy ${inst.key}/${inst.instance} at ${vp}px ${s}: ${a.error}`)
              if ('error' in b) {
                record({ comparison: 'frontend-vs-legacy', key: inst.key, instance: inst.instance, viewport: vp, state: s, status: 'fail', message: `frontend: ${b.error}` })
                continue
              }
              judge('frontend-vs-legacy', inst, vp, s, a.png, b.png, diffStyles(a.styles ?? [], b.styles ?? []))
            }
          }
          if (typeof build === 'string') {
            if (inventory[inst.key]?.builder) failAll('builder-vs-frontend', build)
          } else if (typeof front !== 'string') {
            for (const s of st) {
              const a = front.states[s]
              const b = build.states[s]
              if ('error' in a || 'error' in b) {
                record({ comparison: 'builder-vs-frontend', key: inst.key, instance: inst.instance, viewport: vp, state: s, status: 'fail', message: `builder: ${'error' in b ? b.error : 'ok'}; frontend: ${'error' in a ? a.error : 'ok'}` })
                continue
              }
              judge('builder-vs-frontend', inst, vp, s, a.png, b.png, diffStyles(a.styles ?? [], b.styles ?? []))
            }
          } else failAll('builder-vs-frontend', `frontend render failed: ${front}`)
        }
      } finally {
        await ctx.close()
      }
    })
    }

    await doPass(scrollbar, viewports, true)

    // Informational only (Review Focus 1): the verdict pass runs at scrollbar 0, where a container query and a viewport
    // media query see the same width. Re-run the breakpoint-edge viewports with a classic scrollbar and report both sides.
    if (opts.mode === 'gate' && opts.edgeReport && scrollbar === 0 && results.length) {
      const verdict = { results, skipped, images: keepImages }
      const edgeVps = viewports.filter((v) => EDGES.some(([a, b]) => a === v || b === v))
      if (edgeVps.length) {
        results = []
        skipped = []
        keepImages = false
        await doPass(EDGE_SCROLLBAR, edgeVps, false)
        const differing = results.filter((r) => r.status === 'fail')
        edge = { scrollbar: EDGE_SCROLLBAR, checks: results.length, differ: differing.length, rows: edgeTable(results), results: differing.slice(0, 200) }
      }
      results = verdict.results
      skipped = verdict.skipped
      keepImages = verdict.images
    }
  } finally {
    await browser.close()
    await server.close()
  }

  // A mismatch is an edge mismatch when it appears on exactly one side of a breakpoint edge (the other side matches).
  const byId = new Map<string, CheckResult>()
  const idOf = (r: CheckResult, vp: number) => `${r.comparison}|${r.key}|${r.instance}|${r.state}|${vp}`
  for (const r of results) byId.set(idOf(r, r.viewport), r)
  for (const r of results) {
    if (r.status !== 'fail') continue
    const e = edgeOf(r.viewport)
    if (!e) continue
    const [lo, hi] = e.replace('edge ', '').split('/').map(Number)
    const partner = byId.get(idOf(r, r.viewport === lo ? hi : lo))
    if (partner && partner.status === 'pass') r.edge = e
  }

  results.sort((a, b) => a.key.localeCompare(b.key) || a.instance.localeCompare(b.instance) || a.viewport - b.viewport || a.state.localeCompare(b.state) || a.comparison.localeCompare(b.comparison))
  const fail = results.filter((r) => r.status === 'fail').length

  // A run that is narrowed or altered in any way is not the contract run, and must not read like one.
  const partial: string[] = []
  const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i])
  if (!sameSet(viewports, DEFAULT_VIEWPORTS)) partial.push(`viewports narrowed to ${viewports.join(',')} (the contract has ${DEFAULT_VIEWPORTS.length})`)
  if (keys.length !== allKeys.length) partial.push(`blocks narrowed to ${keys.join(',')} (${allKeys.length} in the reference)`)
  if (opts.legacyCssOnNew) partial.push('legacy CSS loaded on the new side (identity mode, not a parity result)')
  if (opts.theme && opts.theme !== (cfg.theme ?? 'default')) partial.push(`theme ${opts.theme} instead of the configured ${cfg.theme ?? 'default'}`)
  if (scrollbar !== 0) partial.push(`scrollbar ${scrollbar}px (the contract run has 0)`)
  if (opts.reference && reference !== abs(opts.configDir, cfg.reference ?? 'reference')) partial.push(`reference pack overridden (${reference})`)
  if (skipped.length) partial.push(`${skipped.length} state/viewport combination(s) skipped, not captured in the reference`)

  const summary: RunSummary = {
    mode: opts.mode,
    reference,
    theme,
    startedAt: new Date(t0).toISOString(),
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    scrollbar,
    tolerance: TOLERANCE,
    totals: { checks: results.length, pass: results.filter((r) => r.status === 'pass').length, fail, exempt: results.filter((r) => r.status === 'exempt').length, contextGap: results.filter((r) => r.status === 'context-gap').length, skipped: skipped.length, missing: missing.length },
    missing,
    partial,
    unusedContextGaps: Object.keys(contextGaps).filter((k) => !usedGaps.has(k)),
    ...(edge ? { edgeReport: edge } : {}),
    results,
    skipped,
    ok: fail === 0 && missing.length === 0 && results.length > 0,
  }
  writeReport(reportDir, summary)
  return summary
}
