import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { buttonAtom, cardComponent, headlineAtom, paragraphAtom, rowGrid } from '@motor-cms/ui-design-recipes'
import FrontendButton from '../src/frontend/ButtonAtom.vue'
import FrontendCard from '../src/frontend/CardComponent.vue'
import FrontendHeadline from '../src/frontend/HeadlineAtom.vue'
import FrontendParagraph from '../src/frontend/ParagraphAtom.vue'
import FrontendRow from '../src/frontend/RowGrid.vue'
import BuilderButton from '../src/builder/ButtonAtom.vue'
import BuilderCard from '../src/builder/CardComponent.vue'
import BuilderHeadline from '../src/builder/HeadlineAtom.vue'
import BuilderParagraph from '../src/builder/ParagraphAtom.vue'
import BuilderRow from '../src/builder/RowGrid.vue'

const render = (component: Component, props: Record<string, unknown> = {}, slots: Record<string, () => string> = {}) =>
  renderToString(createSSRApp({ render: () => h(component, props, slots) }))

// the class attribute of the first element
const classOf = (html: string) => / class="([^"]*)"/.exec(html)?.[1]
  ?.replaceAll('&#39;', "'")
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&')
const tagOf = (html: string) => /^<([a-z0-9]+)/.exec(html)?.[1]

const files = {
  frontend: { Button: FrontendButton, Card: FrontendCard, Headline: FrontendHeadline, Paragraph: FrontendParagraph, Row: FrontendRow },
  builder: { Button: BuilderButton, Card: BuilderCard, Headline: BuilderHeadline, Paragraph: BuilderParagraph, Row: BuilderRow },
}

describe.each(Object.entries(files))('%s files', (_, c) => {
  describe('variant lists equal the recipe keys', () => {
    it('ButtonAtom: every variant and context the recipe defines is accepted, anything else falls back', async () => {
      for (const variant of Object.keys(buttonAtom.variants.variant)) {
        const html = await render(c.Button, { variant, title: 't' })
        expect(classOf(html), variant).toBe(buttonAtom({ variant: variant as 'dark' }).base())
      }
      for (const context of Object.keys(buttonAtom.variants.context)) {
        const html = await render(c.Button, { context, title: 't' })
        expect(classOf(html), context).toBe(buttonAtom({ context: context as 'none' }).base())
      }
      const fallback = await render(c.Button, { variant: 'nope', context: 'nope', title: 't' })
      expect(classOf(fallback)).toBe(buttonAtom().base())
    })

    it('HeadlineAtom', async () => {
      for (const displayedLevel of Object.keys(headlineAtom.variants.level)) {
        expect(classOf(await render(c.Headline, { type: 'h2', displayedLevel, text: 't' })), displayedLevel).toBe(
          headlineAtom({ level: displayedLevel as 'h2' }),
        )
      }
      for (const weight of Object.keys(headlineAtom.variants.weight)) {
        expect(classOf(await render(c.Headline, { weight, text: 't' })), weight).toBe(headlineAtom({ weight: weight as 'bold' }))
      }
      for (const context of Object.keys(headlineAtom.variants.context)) {
        expect(classOf(await render(c.Headline, { context, text: 't' })), context).toBe(headlineAtom({ context: context as 'none' }))
      }
      expect(classOf(await render(c.Headline, { displayedLevel: 'nope', weight: 'nope', context: 'nope', text: 't' }))).toBe(headlineAtom())
    })

    it('HeadlineAtom: the tag is h1 to h6, anything else h2; the look follows the tag unless displayedLevel is set', async () => {
      expect(tagOf(await render(c.Headline, { type: 'h4', text: 't' }))).toBe('h4')
      expect(tagOf(await render(c.Headline, { type: 'div', text: 't' }))).toBe('h2')
      expect(classOf(await render(c.Headline, { type: 'h4', text: 't' }))).toBe(headlineAtom({ level: 'h4' }))
    })

    it('ParagraphAtom', async () => {
      for (const bullet_type of Object.keys(paragraphAtom.variants.bullets)) {
        expect(classOf(await render(c.Paragraph, { bullet_type, text: 't' })), bullet_type).toBe(paragraphAtom({ bullets: bullet_type as 'dot' }))
      }
      for (const context of Object.keys(paragraphAtom.variants.context)) {
        expect(classOf(await render(c.Paragraph, { context, text: 't' })), context).toBe(paragraphAtom({ context: context as 'none' }))
      }
      expect(classOf(await render(c.Paragraph, { bullet_type: 'nope', context: 'nope', text: 't' }))).toBe(paragraphAtom())
    })
  })

  describe('ParagraphAtom', () => {
    // The next cases pin legacy behaviour of the stored-html atom (legacy ParagraphAtom.vue); they are not bugs to fix.
    const inner = (html: string) => html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '')

    it('uses html when it is not empty, else wraps text in a paragraph', async () => {
      expect(inner(await render(c.Paragraph, { html: '<h2>a</h2>', text: 'b' }))).toBe('<h2>a</h2>')
      expect(inner(await render(c.Paragraph, { html: '', text: 'b' }))).toBe('<p>b</p>')
      expect(inner(await render(c.Paragraph, { text: 'b' }))).toBe('<p>b</p>')
    })

    it('renders <p>undefined</p> when html and text are both unset (legacy behaviour)', async () => {
      expect(inner(await render(c.Paragraph))).toBe('<p>undefined</p>')
    })

    it('strips `nofollow` and the whitespace after it from the whole string, not only from rel (legacy behaviour)', async () => {
      expect(inner(await render(c.Paragraph, { html: '<a rel="nofollow noopener" href="/x">nofollow me</a>' }))).toBe(
        '<a rel="noopener" href="/x">me</a>',
      )
      expect(inner(await render(c.Paragraph, { html: '<p>NoFollow  x</p>' }))).toBe('<p>x</p>')
    })

    it('strips an empty rel="" with the whitespace before it (legacy behaviour)', async () => {
      expect(inner(await render(c.Paragraph, { html: '<a href="/x" rel="">l</a>' }))).toBe('<a href="/x">l</a>')
      expect(inner(await render(c.Paragraph, { html: '<a href="/x" rel="nofollow">l</a>' }))).toBe('<a href="/x">l</a>')
    })

    it('sets the list style variable and the check marker attribute', async () => {
      const html = await render(c.Paragraph, { text: 't', orderedlist_type: 'lower-alpha', bullet_type: 'check' })
      expect(html).toContain('--ordered-list-style:lower-alpha')
      expect(html).toContain('data-bullets="check"')
      expect(await render(c.Paragraph, { text: 't', bullet_type: 'dot' })).not.toContain('data-bullets')
    })
  })

  describe('ButtonAtom', () => {
    it('adds rel for a schemed href and for nothing else', async () => {
      for (const href of ['https://example.org/a', 'mailto:a@example.org', 'tel:+4930123', 'HTTP://x']) {
        expect(await render(c.Button, { href, title: 't' }), href).toContain('rel="noopener noreferrer"')
      }
      for (const href of ['/a', 'a/b', '#top', '?q=a:b', './a:b']) {
        expect(await render(c.Button, { href, title: 't' }), href).not.toContain('rel=')
      }
      expect(await render(c.Button, { title: 't' })).not.toContain('rel=')
    })

    it('a disabled button has no href, is not focusable and says so', async () => {
      const html = await render(c.Button, { variant: 'disabled', href: 'https://example.org/a', target: '_blank', title: 't' })
      expect(html).not.toContain('href=')
      expect(html).not.toContain('rel=')
      expect(html).toContain('aria-disabled="true"')
      expect(html).toContain('tabindex="-1"')
    })

    it('an enabled button keeps its href, is focusable and has no aria-disabled', async () => {
      const html = await render(c.Button, { variant: 'dark', href: '/a', title: 't' })
      expect(html).toContain('href="/a"')
      expect(html).toContain('tabindex="0"')
      expect(html).not.toContain('aria-disabled')
    })

    it('shows the arrow only with has_arrow', async () => {
      expect(await render(c.Button, { title: 't' })).not.toContain('<svg')
      expect(await render(c.Button, { title: 't', has_arrow: true })).toContain('<svg')
    })
  })

  describe('RowGrid', () => {
    const columnClasses = async (spans: unknown[]) => {
      const html = await render(c.Row, { columns: spans.map((span) => ({ span })) })
      return [...html.matchAll(/class="([^"]*tw:shrink-0[^"]*)"/g)].map((m) => m[1])
    }
    const width = (cls: string) => /tw:@lg\/page:w-(\d+)\/12/.exec(cls)?.[1]

    it('every span the recipe defines is used as it is', async () => {
      const spans = Object.keys(rowGrid.variants.span).map(Number)
      expect((await columnClasses(spans)).map(width)).toEqual(spans.map(String))
    })

    it('clamps anything outside 1 to 12 and any non-integer to 12', async () => {
      const cols = await columnClasses([0, 13, -2, 2.5, undefined, '4', null, Number.NaN])
      expect(cols.map(width)).toEqual(Array(8).fill('12'))
    })

    it('puts the column slot content into its column', async () => {
      const html = await renderToString(
        createSSRApp({ render: () => h(c.Row, { columns: [{}, {}] }, { 'column-0': () => h('i', 'a'), 'column-1': () => h('b', 'b') }) }),
      )
      expect(html).toMatch(/<i>a<\/i>.*<b>b<\/b>/)
    })
  })

  describe('CardComponent', () => {
    it('keeps the image strip only when there is no image slot', async () => {
      const empty = cardComponent({ empty: true })
      const filled = cardComponent({ empty: false })
      const without = await render(c.Card, {}, { body: () => 'b' })
      const withImage = await render(c.Card, {}, { image: () => 'i', body: () => 'b' })
      expect(without).toContain(`class="${empty.image()}"`)
      expect(withImage).toContain(`class="${filled.image()}"`)
      expect(empty.image()).not.toBe(filled.image())
    })
  })
})
