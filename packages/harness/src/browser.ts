import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { StyleEl } from './compare.js'
import { placeholderHtml } from './container.js'
import type { ForeignBox, ForeignSelector } from './types.js'

// Stabilisation of the capture (reduced motion, animations and transitions off, fonts loaded, images loaded),
// reproduced here so that a legacy render is made under the conditions of the reference.
export const DEFAULT_VIEWPORTS = [375, 575, 576, 669, 670, 767, 768, 991, 992, 1024, 1025, 1199, 1200, 1399, 1400, 1440, 1441, 1919, 1920]
export const DEFAULT_VIEWPORT_HEIGHT = 2800
export const EDGES: [number, number][] = [
  [575, 576],
  [669, 670],
  [767, 768],
  [991, 992],
  [1024, 1025],
  [1199, 1200],
  [1399, 1400],
  [1440, 1441],
  [1919, 1920],
]
export const edgeOf = (vp: number): string | undefined => {
  const e = EDGES.find(([a, b]) => a === vp || b === vp)
  return e ? `edge ${e[0]}/${e[1]}` : undefined
}

const FREEZE_CSS = `
*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}
`

export class RenderError extends Error {}

export type Route = 'legacy' | 'frontend' | 'builder'

export interface RenderSpec {
  route: Route
  key: string
  instance: string
  viewport: number
  width?: number
  theme: string
  scrollbar: number
  /** load the legacy CSS on frontend/builder as well */
  legacyCss?: boolean
  /** sub-pixel origin of the element inside the page (px, fractional part only) */
  origin?: [number, number]
  states: string[]
  wantStyles: boolean
  /** legacy route, container mode: measure these children and replace them by placeholders */
  container?: ForeignSelector[]
  /** frontend/builder route, container mode: the boxes measured in the legacy render, handed to the adapter as ctx.foreign */
  foreign?: ForeignBox[]
}

/** Search for the sub-pixel origin at which the first state's screenshot best matches a target (validate mode). */
export interface OriginFit {
  candidates: [number, number][]
  /** lower is better; 0 ends the search */
  score: (png: Buffer) => number
}

export interface Rendered {
  /** origin used (the fitted one when a fit was asked for) */
  origin?: [number, number]
  /** per state: PNG and styles, or the reason the state could not be produced */
  states: Record<string, { png: Buffer; styles?: StyleEl[] } | { error: string }>
  fonts: string[]
  /** container mode: the legacy children that were measured and replaced (legacy route) */
  foreign?: ForeignBox[]
  /** container mode (frontend/builder route): how the new render deviates from the handed placeholders; empty when it does not */
  containerProblems?: string[]
}

// In-page helpers: serialised into the browser, they must not close over Node variables.
const FONT_CHECK = async (declared: string[]) => {
  const norm = (s: string) => s.replace(/["']/g, '')
  const faces = [...document.fonts]
  const seen = new Set(faces.map((f) => norm(f.family)))
  const problems: string[] = []
  for (const d of declared) if (!seen.has(d)) problems.push(`font "${d}" is not declared by any @font-face`)
  await Promise.all(faces.map((f) => f.load().catch(() => undefined)))
  await document.fonts.ready
  for (const f of faces) {
    if (f.status !== 'loaded') problems.push(`font "${norm(f.family)}" (weight ${f.weight}, style ${f.style}) did not load: status ${f.status}`)
  }
  for (const fam of seen) if (!document.fonts.check(`16px "${fam}"`)) problems.push(`font "${fam}" fails document.fonts.check`)
  return { problems: [...new Set(problems)], faces: faces.map((f) => `${norm(f.family)}:${f.weight}:${f.style}:${f.status}`) }
}

const IMAGES_DONE = async () => {
  const imgs = [...document.images]
  await Promise.all(
    imgs.map((i) =>
      i.complete && i.naturalWidth > 0
        ? true
        : new Promise((res) => {
            i.addEventListener('load', () => res(true), { once: true })
            i.addEventListener('error', () => res(false), { once: true })
            setTimeout(() => res(false), 10000)
          }),
    ),
  )
  return imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src') ?? '')
}

// CSS background images (also on pseudo-elements, and the ones a hover or focus state switches on) load lazily: wait
// until every one of them has loaded, instead of sleeping a fixed time and hoping.
export const BG_DONE = async () => {
  const urls = new Set<string>()
  for (const e of document.querySelectorAll('#parity-page, #parity-page *')) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(e, pseudo)
      for (const prop of [cs.backgroundImage, cs.maskImage, cs.borderImageSource, cs.listStyleImage, cs.content]) {
        for (const m of (prop ?? '').matchAll(/url\((["']?)(.*?)\1\)/g)) urls.add(new URL(m[2], document.baseURI).href)
      }
    }
  }
  const failed: string[] = []
  await Promise.all(
    [...urls].map(
      (u) =>
        new Promise<void>((res) => {
          const img = new Image()
          const done = (ok: boolean) => {
            if (!ok) failed.push(u)
            res()
          }
          img.onload = () => done(true)
          img.onerror = () => done(false)
          setTimeout(() => done(false), 10000)
          img.src = u
        }),
    ),
  )
  await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())))
  return [...new Set(failed)]
}

// The block is everything below #parity-leaf (display: contents): one root element normally, several when a block
// emits siblings or a fragment. All of them are screenshotted and style-diffed.
const STYLES = () => {
  const roots = [...(document.getElementById('parity-leaf')?.children ?? [])]
  if (!roots.length) return null
  const pathOf = (e: Element) => {
    const parts: string[] = []
    let cur: Element | null = e
    while (cur) {
      const parent: Element | null = cur.parentElement
      const tag = cur.tagName.toLowerCase()
      const ri = roots.indexOf(cur)
      if (ri >= 0) {
        parts.unshift(roots.length === 1 ? tag : `${tag}@${ri}`)
        break
      }
      parts.unshift(`${tag}[${[...(parent as Element).children].indexOf(cur)}]`)
      cur = parent
    }
    return parts.join(' > ')
  }
  const dump = (cs: CSSStyleDeclaration) => {
    const o: Record<string, string> = {}
    for (const k of [...cs]) o[k] = cs.getPropertyValue(k)
    return o
  }
  const out: { path: string; style: Record<string, string> }[] = []
  for (const e of roots.flatMap((r) => [r, ...r.querySelectorAll('*')])) {
    out.push({ path: pathOf(e), style: dump(getComputedStyle(e)) })
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(e, pseudo)
      if (ps.content && ps.content !== 'none' && ps.content !== 'normal') out.push({ path: pathOf(e) + pseudo, style: dump(ps) })
    }
  }
  return out
}

// Same fixed scroll position as the capture: element centred, or top-aligned when taller than the viewport.
const SCROLL_TO = () => {
  const roots = [...document.getElementById('parity-leaf')!.children] as HTMLElement[]
  if (roots.length === 1) {
    const el = roots[0]
    el.scrollIntoView({ block: el.getBoundingClientRect().height < window.innerHeight ? 'center' : 'start', inline: 'nearest', behavior: 'instant' })
    return
  }
  const rects = roots.map((r) => r.getBoundingClientRect())
  const top = Math.min(...rects.map((r) => r.top)) + window.scrollY
  const height = Math.max(...rects.map((r) => r.bottom)) + window.scrollY - top
  window.scrollTo({ top: height < window.innerHeight ? top - (window.innerHeight - height) / 2 : top, behavior: 'instant' })
}

/** Union of the roots' boxes in document coordinates, rounded outwards (for a screenshot of a multi-root block). */
const UNION_BOX = () => {
  const rects = [...document.getElementById('parity-leaf')!.children].map((r) => r.getBoundingClientRect())
  const x = Math.floor(Math.min(...rects.map((r) => r.left)) + window.scrollX)
  const y = Math.floor(Math.min(...rects.map((r) => r.top)) + window.scrollY)
  const right = Math.ceil(Math.max(...rects.map((r) => r.right)) + window.scrollX)
  const bottom = Math.ceil(Math.max(...rects.map((r) => r.bottom)) + window.scrollY)
  return { x, y, width: right - x, height: bottom - y }
}

// Container mode, legacy side. Finds the foreign children, tags them and returns their border boxes and the layout
// properties that matter for their parent. Nested matches: the outermost element wins.
const MEASURE_FOREIGN = (entries: { id: string; selector: string }[]) => {
  const leaf = document.getElementById('parity-leaf')!
  const roots = [...leaf.children]
  const found: { el: Element; id: string; selector: string }[] = []
  for (const e of entries) {
    let list: Element[]
    try {
      list = [...leaf.querySelectorAll(e.selector)]
    } catch {
      return { error: `selector ${JSON.stringify(e.selector)} is not valid` }
    }
    if (!list.length) return { error: `selector ${JSON.stringify(e.selector)} (foreign child "${e.id}") matched no element in the legacy render` }
    for (const el of list) {
      if (roots.includes(el)) return { error: `selector ${JSON.stringify(e.selector)} matches the root of the block: the block itself cannot be a foreign child` }
      if (!found.some((f) => f.el === el)) found.push({ el, id: e.id, selector: e.selector })
    }
  }
  const kept = found.filter((f) => !found.some((o) => o.el !== f.el && o.el.contains(f.el)))
  kept.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  const DEFAULTS: Record<string, string> = { position: 'static', float: 'none', clear: 'none', 'vertical-align': 'baseline', 'align-self': 'auto', 'justify-self': 'auto', order: '0', 'grid-column-start': 'auto', 'grid-column-end': 'auto', 'grid-row-start': 'auto', 'grid-row-end': 'auto', transform: 'none', translate: 'none', rotate: 'none', scale: 'none' }
  const rootRect = roots[0].getBoundingClientRect()
  const boxes = []
  for (let i = 0; i < kept.length; i++) {
    const { el, id, selector } = kept[i]
    const cs = getComputedStyle(el)
    if (cs.display === 'contents') return { error: `foreign child ${JSON.stringify(selector)} is display: contents and has no box to measure: select its children instead` }
    const r = el.getBoundingClientRect()
    const layout: Record<string, string> = {}
    // a box the placeholder can size: inline boxes become inline-blocks, every other display a block
    layout.display = cs.display === 'none' ? 'none' : cs.display.startsWith('inline') ? 'inline-block' : 'block'
    for (const k of Object.keys(DEFAULTS)) if (cs.getPropertyValue(k) !== DEFAULTS[k]) layout[k] = cs.getPropertyValue(k)
    // the measured box includes transforms, so the placeholder must be drawn with them (same size, so same origin maths)
    if (cs.transform !== 'none' || cs.translate !== 'none' || cs.rotate !== 'none' || cs.scale !== 'none') layout['transform-origin'] = cs.transformOrigin
    if (cs.position !== 'static') for (const k of ['top', 'right', 'bottom', 'left']) if (cs.getPropertyValue(k) !== 'auto') layout[k] = cs.getPropertyValue(k)
    el.setAttribute('data-parity-measure', String(i))
    boxes.push({ id, index: i, selector, x: r.left - rootRect.left, y: r.top - rootRect.top, width: r.width, height: r.height, margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`, layout })
  }
  return { boxes }
}

const REPLACE_FOREIGN = (items: { index: number; html: string }[]) => {
  for (const it of items) {
    const el = document.querySelector(`[data-parity-measure="${it.index}"]`)
    const t = document.createElement('template')
    t.innerHTML = it.html
    el!.replaceWith(t.content)
  }
  return document.body.offsetHeight
}

// Container mode, new side: every placeholder handed over must be in the render exactly once, at the measured size.
const CHECK_PLACEHOLDERS = (expected: { index: number; id: string; x: number; y: number; width: number; height: number }[]) => {
  const leaf = document.getElementById('parity-leaf')!
  const rootRect = leaf.children[0]?.getBoundingClientRect()
  const els = [...leaf.querySelectorAll('[data-parity-foreign]')]
  const problems: string[] = []
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000)
  for (const e of expected) {
    const m = els.filter((x) => x.getAttribute('data-parity-foreign') === String(e.index))
    if (!m.length) problems.push(`placeholder ${e.index} (${e.id}) is missing in the new render`)
    else if (m.length > 1) problems.push(`placeholder ${e.index} (${e.id}) appears ${m.length} times in the new render`)
    else {
      const r = m[0].getBoundingClientRect()
      if (Math.abs(r.width - e.width) > 0.05 || Math.abs(r.height - e.height) > 0.05) {
        problems.push(`placeholder ${e.index} (${e.id}) is ${fmt(r.width)}x${fmt(r.height)} in the new render, measured ${fmt(e.width)}x${fmt(e.height)} in the legacy render`)
      }
      // offset inside the container's border box (first root), within 0.5 px
      const x = r.left - (rootRect?.left ?? 0)
      const y = r.top - (rootRect?.top ?? 0)
      if (Math.abs(x - e.x) > 0.5 || Math.abs(y - e.y) > 0.5) {
        problems.push(`placeholder ${e.index} (${e.id}) is at ${fmt(x)},${fmt(y)} in the new render, measured at ${fmt(e.x)},${fmt(e.y)} in the legacy render`)
      }
    }
  }
  for (const x of els) {
    if (!expected.some((e) => String(e.index) === x.getAttribute('data-parity-foreign'))) problems.push(`placeholder ${x.getAttribute('data-parity-foreign')} in the new render was never measured in the legacy render`)
  }
  return problems
}

const FOCUSED_INSIDE = () => {
  const t = document.getElementById('parity-leaf')
  const a = document.activeElement
  return !!t && !!a && a !== document.body && t.contains(a) && a.matches(':focus-visible')
}

export interface BrowserOptions {
  origin: string
  reference: string
  fonts: string[]
  assetOrigin: RegExp
  viewportHeight: number
}

const CONTENT_TYPES: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  css: 'text/css',
}

export const newContext = async (browser: Browser, vp: number, o: BrowserOptions, problems: string[]): Promise<BrowserContext> => {
  const ctx = await browser.newContext({
    viewport: { width: vp, height: o.viewportHeight },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'block',
  })
  const host = new URL(o.origin).host
  // Asset mapping: origins of the captured page (absolute URLs in the captured CSS) answer from <reference>/_assets.
  // Everything else outside the harness server is blocked, as in the capture.
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url())
    if (u.host === host || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    if (o.assetOrigin.test(u.origin)) {
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '')
      const file = join(o.reference, '_assets', rel)
      if (rel && !rel.includes('..') && existsSync(file)) {
        const ext = rel.split('.').pop()?.toLowerCase() ?? ''
        return route.fulfill({
          body: readFileSync(file),
          contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
          headers: { 'access-control-allow-origin': '*' },
        })
      }
      problems.push(`asset ${u.href} has no file at _assets/${rel}`)
      return route.fulfill({ status: 404, body: 'not found' })
    }
    return route.abort()
  })
  return ctx
}

export const render = async (ctx: BrowserContext, problems: string[], o: BrowserOptions, spec: RenderSpec, fit?: OriginFit): Promise<Rendered> => {
  problems.length = 0
  const page: Page = await ctx.newPage()
  const local: string[] = []
  page.on('pageerror', (e) => local.push(`page error: ${e.message}`))
  page.on('response', (r) => {
    const u = r.url()
    if (r.status() >= 400 && !u.endsWith('/favicon.ico')) local.push(`${r.status()} ${u}`)
  })
  try {
    const q = new URLSearchParams({ vp: String(spec.viewport), theme: spec.theme, scrollbar: String(spec.scrollbar) })
    if (spec.width !== undefined) q.set('w', String(spec.width))
    if (spec.legacyCss) q.set('legacyCss', '1')
    if (spec.origin?.[0]) q.set('ox', String(spec.origin[0]))
    if (spec.origin?.[1]) q.set('oy', String(spec.origin[1]))
    // Container mode: the boxes measured in the legacy render reach the adapter as ctx.foreign (see app/main.ts).
    if (spec.foreign) await page.addInitScript((f) => { (window as any).__parityForeign = f }, spec.foreign)
    const url = `${o.origin}/${spec.route}/${encodeURIComponent(spec.key)}/${encodeURIComponent(spec.instance)}?${q}`
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page
      .waitForFunction(() => (window as any).__parityReady || (window as any).__parityError, undefined, { timeout: 60_000 })
      .catch(() => {
        throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} at ${spec.viewport}px did not become ready`)
      })
    const err = await page.evaluate(() => (window as any).__parityError as string | undefined)
    if (err) throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} at ${spec.viewport}px: ${err}`)
    await page.addStyleTag({ content: FREEZE_CSS })

    const fonts = await page.evaluate(FONT_CHECK, o.fonts)
    if (fonts.problems.length) throw new RenderError(`font check failed (${spec.route} ${spec.key}/${spec.instance} at ${spec.viewport}px): ${fonts.problems.join('; ')}`)
    const notLoaded = await page.evaluate(IMAGES_DONE)
    if (notLoaded.length) throw new RenderError(`images did not load (${spec.route} ${spec.key}/${spec.instance} at ${spec.viewport}px): ${notLoaded.join(', ')}`)
    const bgFailed = await page.evaluate(BG_DONE)
    if (bgFailed.length) throw new RenderError(`background images did not load (${spec.route} ${spec.key}/${spec.instance} at ${spec.viewport}px): ${bgFailed.join(', ')}`)
    if (local.length) throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} at ${spec.viewport}px: ${local.join('; ')}`)
    if (problems.length) throw new RenderError(problems.join('; '))

    // Container mode, legacy: the foreign children become neutral placeholders of exactly their size.
    let foreign: ForeignBox[] | undefined
    if (spec.container) {
      const m = (await page.evaluate(MEASURE_FOREIGN, spec.container)) as { error: string } | { boxes: Omit<ForeignBox, 'html'>[] }
      if ('error' in m) throw new RenderError(`container mode, legacy render of ${spec.key}/${spec.instance} at ${spec.viewport}px: ${m.error}`)
      foreign = m.boxes.map((b) => ({ ...b, html: placeholderHtml(b) }))
      await page.evaluate(REPLACE_FOREIGN, foreign.map((b) => ({ index: b.index, html: b.html })))
    }
    // Container mode, new render: did the adapter put the handed placeholders in, at the measured sizes?
    const containerProblems = spec.foreign ? await page.evaluate(CHECK_PLACEHOLDERS, spec.foreign) : undefined

    const rootCount = await page.locator('#parity-leaf > *').count()
    if (rootCount === 0) throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} produced no element`)
    const loc = page.locator('#parity-leaf > *').first()
    // One root: the element screenshot (as the capture). Several: the union box of all of them, so extra siblings count.
    const shoot = async () => {
      if (rootCount === 1) return loc.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css', timeout: 30_000 })
      return page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css', timeout: 30_000, fullPage: true, clip: await page.evaluate(UNION_BOX) })
    }
    const out: Rendered['states'] = {}
    let origin = spec.origin
    const setOrigin = (x: number, y: number) =>
      page.evaluate(([ox, oy]) => {
        const b = document.getElementById('parity-box')!
        b.style.paddingLeft = `${ox}px`
        b.style.paddingTop = `${oy}px`
        return document.body.offsetHeight
      }, [x, y])
    if (fit) {
      let best = Infinity
      for (const c of fit.candidates) {
        await setOrigin(c[0], c[1])
        await page.evaluate(SCROLL_TO)
        const sc = fit.score(await shoot())
        if (sc < best) {
          best = sc
          origin = c
        }
        if (sc === 0) break
      }
      if (origin) await setOrigin(origin[0], origin[1])
    }
    for (const state of spec.states) {
      await page.mouse.move(0, 0)
      await page.evaluate(SCROLL_TO)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
      if (state === 'hover') {
        await loc.hover({ timeout: 15_000 })
      } else if (state === 'focus-visible') {
        await page.evaluate(() => (document.getElementById('parity-prev') as HTMLElement).focus({ preventScroll: true }))
        await page.keyboard.press('Tab')
        if (!(await page.evaluate(FOCUSED_INSIDE))) {
          out[state] = { error: 'keyboard Tab did not reach a :focus-visible element inside the block' }
          continue
        }
      } else if (state !== 'default') {
        out[state] = { error: `unknown state ${state}` }
        continue
      }
      await page.evaluate(SCROLL_TO)
      // The state may switch on background images (hover, focus): wait for them and two frames instead of a fixed sleep.
      const stateBg = await page.evaluate(BG_DONE)
      if (stateBg.length) throw new RenderError(`background images did not load in state ${state} (${spec.route} ${spec.key}/${spec.instance} at ${spec.viewport}px): ${stateBg.join(', ')}`)
      await page.evaluate(() => document.body.offsetHeight)
      const png = await shoot()
      const styles = spec.wantStyles ? ((await page.evaluate(STYLES)) as StyleEl[] | null) ?? undefined : undefined
      out[state] = { png, styles }
    }
    if (problems.length) throw new RenderError(problems.join('; '))
    return { states: out, fonts: fonts.faces, origin, foreign, containerProblems }
  } finally {
    await page.close()
  }
}
