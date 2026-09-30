import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { afterAll, describe, expect, it } from 'vitest'
import { base, buildTokens } from '@motor-cms/ui-design-tokens'
import { paragraphAtom } from '@motor-cms/ui-design-recipes'

// Tailwind generates CSS for the arbitrary variants (a typo would generate nothing and fail no other test).
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = join(pkgRoot, 'node_modules', '.zrm-test')
mkdirSync(scratchRoot, { recursive: true })
const out = mkdtempSync(join(scratchRoot, 'paragraph-'))
buildTokens({ base, themes: { neutral: {} }, defaultTheme: 'neutral', outDir: out })
afterAll(() => rmSync(out, { recursive: true, force: true }))

const cls = (o: Parameters<typeof paragraphAtom>[0] = {}) => paragraphAtom(o).split(/\s+/)

describe('paragraphAtom', () => {
  it('sets the paragraph scale and the rich-text element rules', () => {
    const c = cls()
    for (const x of ['tw:text-p', 'tw:tracking-normal', 'tw:[&_p]:mb-4', 'tw:[&_p:last-child]:mb-0', 'tw:[&_h1]:text-h1', 'tw:[&_h6]:text-h6', 'tw:[&_strong]:font-bold', 'tw:[&_em]:italic', 'tw:[&_ul]:pl-6', 'tw:[&_a]:underline', 'tw:[&_a:hover]:text-primary-100']) {
      expect(c).toContain(x)
    }
    expect(c).not.toContain('tw:tracking-[0.5px]')
  })

  it('a heading inside keeps its size next to its colour', () => {
    const c = cls()
    expect(c).toContain('tw:[&_h2]:text-h2')
    expect(c).toContain('tw:[&_h2]:text-dark-100')
  })

  it('bullets none leaves the list markers alone', () => {
    expect(cls({ bullets: 'none' }).some((x) => x.includes('list-none'))).toBe(false)
  })
  it('bullets dot removes the markers and draws a round dot', () => {
    const c = cls({ bullets: 'dot' })
    expect(c).toContain('tw:[&_ul]:list-none')
    expect(c).toContain('tw:[&_ul]:pl-0')
    expect(c).toContain('tw:[&_ul_li]:before:rounded-full')
  })
  it('bullets check removes the markers and leaves the marker to the styles sheet', () => {
    const c = cls({ bullets: 'check' })
    expect(c).toContain('tw:[&_ul]:list-none')
    expect(c.some((x) => x.includes('before:'))).toBe(false)
  })

  // One test per context value.
  it('context none changes nothing', () => expect(cls({ context: 'none' })).toEqual(cls()))
  it('context hyphenated turns hyphenation on', () => expect(cls({ context: 'hyphenated' })).toContain('tw:hyphens-auto'))
  it('context left aligns left', () => expect(cls({ context: 'left' })).toContain('tw:text-left'))
  it('context muted-pointer softens the colour and shows a pointer', () => {
    const c = cls({ context: 'muted-pointer' })
    expect(c).toContain('tw:text-dark-80')
    expect(c).toContain('tw:cursor-pointer')
    expect(c).not.toContain('tw:text-dark-100')
  })
  it('context soft softens the colour', () => {
    const c = cls({ context: 'soft' })
    expect(c).toContain('tw:text-dark-95')
    expect(c).not.toContain('tw:text-dark-100')
  })
  it('context spaced adds a gap above and below', () => expect(cls({ context: 'spaced' })).toContain('tw:my-4'))
  it('context padded-end pads the end from the vpl width on', () => expect(cls({ context: 'padded-end' })).toContain('tw:@vpl/page:pr-6'))
  it('context padded-start pads the start from the vpl width on', () => expect(cls({ context: 'padded-start' })).toContain('tw:@vpl/page:pl-6'))
})

describe('paragraphAtom css', () => {
  it('every class generates the declaration it stands for', async () => {
    const input = `@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme) prefix(tw);
@import "tailwindcss/utilities.css" layer(utilities) prefix(tw);
@import ${JSON.stringify(join(out, 'theme.css'))};
`
    const candidates = [...cls({ bullets: 'dot', context: 'padded-end' }), ...cls({ context: 'hyphenated' }), ...cls({ context: 'soft' })]
    const css = (await compile(input, { base: pkgRoot, onDependency: () => undefined })).build(candidates)
    expect(css).toMatch(/list-style-type: none/)
    expect(css).toMatch(/-webkit-text-stroke: 0\.4px currentcolor/)
    expect(css).toMatch(/text-decoration-line: underline/)
    expect(css).toMatch(/:before|::before/)
    expect(css).toMatch(/hyphens: auto/)
    expect(css).toMatch(/list-style: var\(--ordered-list-style\)/)
    expect(css).toMatch(/@container page \(width >= 1025px\)/)
    expect(css).toMatch(/h1[^{]*\{[^}]*font-size: clamp\(/)
  })
})
