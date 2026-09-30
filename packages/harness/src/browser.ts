import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { StyleEl } from './compare.js'

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
  /** transparent page background and RGBA screenshots (validate: backdrop inference) */
  transparent?: boolean
  /** sub-pixel origin of the element inside the page (px, fractional part only) */
  origin?: [number, number]
  states: string[]
  wantStyles: boolean
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

const STYLES = () => {
  const root = document.querySelector('#parity-leaf > *') as Element | null
  if (!root) return null
  const pathOf = (e: Element) => {
    const parts: string[] = []
    let cur: Element | null = e
    while (cur) {
      const parent: Element | null = cur.parentElement
      const tag = cur.tagName.toLowerCase()
      parts.unshift(cur === root ? tag : `${tag}[${[...(parent as Element).children].indexOf(cur)}]`)
      if (cur === root) break
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
  for (const e of [root, ...root.querySelectorAll('*')]) {
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
  const el = document.querySelector('#parity-leaf > *') as HTMLElement
  el.scrollIntoView({ block: el.getBoundingClientRect().height < window.innerHeight ? 'center' : 'start', inline: 'nearest', behavior: 'instant' })
}

const FOCUSED_INSIDE = () => {
  const t = document.querySelector('#parity-leaf > *')
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
    const url = `${o.origin}/${spec.route}/${encodeURIComponent(spec.key)}/${encodeURIComponent(spec.instance)}?${q}`
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page
      .waitForFunction(() => (window as any).__parityReady || (window as any).__parityError, undefined, { timeout: 60_000 })
      .catch(() => {
        throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} at ${spec.viewport}px did not become ready`)
      })
    const err = await page.evaluate(() => (window as any).__parityError as string | undefined)
    if (err) throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} at ${spec.viewport}px: ${err}`)
    await page.addStyleTag({ content: FREEZE_CSS + (spec.transparent ? 'html,body,#parity-page{background:transparent!important}' : '') })

    const fonts = await page.evaluate(FONT_CHECK, o.fonts)
    if (fonts.problems.length) throw new RenderError(`font check failed (${spec.route} ${spec.key}/${spec.instance} at ${spec.viewport}px): ${fonts.problems.join('; ')}`)
    const notLoaded = await page.evaluate(IMAGES_DONE)
    if (notLoaded.length) throw new RenderError(`images did not load (${spec.route} ${spec.key}/${spec.instance} at ${spec.viewport}px): ${notLoaded.join(', ')}`)
    if (local.length) throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} at ${spec.viewport}px: ${local.join('; ')}`)
    if (problems.length) throw new RenderError(problems.join('; '))

    const loc = page.locator('#parity-leaf > *').first()
    if ((await page.locator('#parity-leaf > *').count()) === 0) throw new RenderError(`${spec.route} render of ${spec.key}/${spec.instance} produced no element`)
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
        const sc = fit.score(await loc.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css', timeout: 30_000 }))
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
      await page.waitForTimeout(150)
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
      await page.waitForTimeout(100)
      await page.evaluate(() => document.body.offsetHeight)
      const png = await loc.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css', timeout: 30_000, omitBackground: !!spec.transparent })
      const styles = spec.wantStyles ? ((await page.evaluate(STYLES)) as StyleEl[] | null) ?? undefined : undefined
      out[state] = { png, styles }
    }
    if (problems.length) throw new RenderError(problems.join('; '))
    return { states: out, fonts: fonts.faces, origin }
  } finally {
    await page.close()
  }
}
