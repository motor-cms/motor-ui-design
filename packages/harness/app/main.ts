// Parity harness page. Routes (all inside the page container):
//   /legacy/:key/:instance     captured outer.html + the captured page CSS
//   /frontend/:key/:instance   the consumer's frontend block from the block map + the consumer's CSS
//   /builder/:key/:instance    the consumer's builder block from the block map + the consumer's CSS
// Query: vp (viewport, selects the markup), w (width of the box the element sits in), theme, scrollbar (px the page
// root is narrower than the viewport), legacyCss=1 (load the legacy CSS on /frontend and /builder as well).
import { createApp, h, nextTick, defineComponent } from 'vue'

const w = window as unknown as Record<string, unknown>
const fail = (e: unknown) => {
  w.__parityError = e instanceof Error ? `${e.message}` : String(e)
}

const nextFrames = (n: number) =>
  new Promise<void>((res) => {
    const step = (i: number) => (i <= 0 ? res() : requestAnimationFrame(() => step(i - 1)))
    step(n)
  })

const loadSheet = (href: string) =>
  new Promise<void>((res, rej) => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = href
    l.onload = () => res()
    l.onerror = () => rej(new Error(`stylesheet failed to load: ${href}`))
    document.head.appendChild(l)
  })

const run = async () => {
  const [, route, keyRaw, instanceRaw] = location.pathname.split('/')
  if (route === 'inventory') {
    // Which implementations the consumer's block map has, per key (the runner reports missing ones).
    const blocks = ((await import('virtual:parity-blocks' as string)) as { default: Record<string, any> }).default
    w.__parityInventory = Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, { frontend: typeof v?.frontend === 'function', builder: typeof v?.builder === 'function', props: typeof v?.props === 'function' }]))
    w.__parityReady = true
    return
  }
  const key = decodeURIComponent(keyRaw ?? '')
  const instance = decodeURIComponent(instanceRaw ?? '')
  const q = new URLSearchParams(location.search)
  const vp = Number(q.get('vp') ?? window.innerWidth)
  const width = q.get('w')
  const scrollbar = Number(q.get('scrollbar') ?? 0)
  if (!['legacy', 'frontend', 'builder'].includes(route)) throw new Error(`unknown route ${location.pathname}`)

  const res = await fetch(`/__parity/instance/${encodeURIComponent(key)}/${encodeURIComponent(instance)}?vp=${vp}`)
  if (!res.ok) throw new Error(await res.text())
  const { fixture, html, css } = (await res.json()) as { fixture: unknown; html: string; css: string }

  const page = document.createElement('div')
  page.id = 'parity-page'
  page.setAttribute('style', `container-type:inline-size;container-name:page;${scrollbar ? `width:calc(100% - ${scrollbar}px);` : ''}`)
  const box = document.createElement('div')
  box.id = 'parity-box'
  // flow-root: the element's own top margin must not collapse through the box and swallow the sub-pixel origin.
  box.style.display = 'flow-root'
  // content-box: a page-wide `* { box-sizing: border-box }` must not make the origin padding eat into the element's width.
  box.style.boxSizing = 'content-box'
  if (width) box.style.width = `${width}px`
  // Sub-pixel origin of the element on the captured page (see the harness README): padding, so that layout and paint see it.
  if (q.get('ox')) box.style.paddingLeft = `${q.get('ox')}px`
  if (q.get('oy')) box.style.paddingTop = `${q.get('oy')}px`
  page.appendChild(box)
  // Spacers above and below: the capture scrolled the element to the middle of the viewport, which matters for
  // position: fixed/sticky content inside the excerpt. Same scroll here, so the page must be scrollable both ways.
  const spacer = () => {
    const d = document.createElement('div')
    d.style.height = `${window.innerHeight}px`
    return d
  }
  // Focus sentinel: like the capture, focus the previous focusable element, then a real Tab moves onto the block.
  const sentinel = document.createElement('button')
  sentinel.id = 'parity-prev'
  sentinel.setAttribute('style', 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;border:0;pointer-events:none')
  sentinel.setAttribute('aria-hidden', 'true')
  document.body.appendChild(sentinel)
  document.body.appendChild(spacer())
  document.body.appendChild(page)
  document.body.appendChild(spacer())
  // Context of the excerpt: the captured element carries BEM classes (`block__element`) whose parent block was an
  // ancestor on the real page, and page CSS may select through it (`[class^="x-"] a`). Recreate those ancestors as
  // layout-neutral wrappers (display: contents). Only where the legacy CSS is loaded.
  const leaf = document.createElement('div')
  leaf.id = 'parity-leaf'
  leaf.style.display = 'contents'
  const wrapWithContext = (html: string) => {
    const t = document.createElement('template')
    t.innerHTML = html
    const first = t.content.firstElementChild
    const parents = new Set<string>()
    for (const c of first?.classList ?? []) {
      const m = c.match(/^(.+?)__[^_]/)
      if (m) parents.add(m[1])
    }
    let host: HTMLElement = box
    for (const p of parents) {
      const w = document.createElement('div')
      w.className = p
      w.style.display = 'contents'
      host.appendChild(w)
      host = w
    }
    host.appendChild(leaf)
  }

  const legacyHref = `/__parity/legacy.css?file=${encodeURIComponent(css)}`
  if (route === 'legacy') {
    await loadSheet(legacyHref)
    wrapWithContext(html)
    const t = document.createElement('template')
    t.innerHTML = html
    leaf.appendChild(t.content)
  } else {
    const theme = q.get('theme')
    if (theme) document.documentElement.setAttribute('data-theme', theme)
    if (q.get('legacyCss') === '1') {
      await loadSheet(legacyHref)
      wrapWithContext(html)
    } else box.appendChild(leaf)
    await import('virtual:parity-css' as string)
    const blocks = ((await import('virtual:parity-blocks' as string)) as { default: Record<string, any> }).default
    const entry = blocks[key]
    const loader = entry?.[route]
    if (!loader) throw new Error(`block map has no ${route} implementation for ${key}`)
    const mod = await loader()
    const component = mod.default ?? mod
    // The legacy markup is handed to adapters only in identity/test mode (--legacy-css-on-new): a real adapter must map
    // the fixture to props itself, that mapping is what the app will use.
    // Container mode: the foreign children measured in the legacy render of this instance (see README), else none.
    const foreign = (w.__parityForeign as unknown[] | undefined) ?? []
    const ctx = { key, instance, viewport: vp, legacyHtml: q.get('legacyCss') === '1' ? html : '', foreign }
    const props = entry.props(fixture, ctx)
    const slotHtml: Record<string, string> = entry.slots ? entry.slots(fixture, ctx) : {}
    const slots = Object.fromEntries(Object.entries(slotHtml).map(([n, s]) => [n, () => h('span', { style: 'display:contents', innerHTML: s })]))
    const Root = defineComponent({ setup: () => () => h(component, props, slots) })
    createApp(Root).mount(leaf)
  }
  await nextTick()
  await nextFrames(2)
  w.__parityReady = true
}

run().catch(fail)
