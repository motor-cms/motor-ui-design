import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { afterAll, describe, expect, it } from 'vitest'
import { base, buildTokens } from '@motor-cms/ui-design-tokens'

// The contract with Tailwind 4 (DECISIONS 8, 15): every utility carries the `tw:` prefix, no Preflight, the layer order is
// declared up front, nothing is `!important`, and container variants use the page container. theme.css is compiled here
// with the real Tailwind compiler and a tiny sample, so a change to the token mapping that Tailwind cannot resolve fails.
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = join(pkgRoot, 'node_modules', '.zrm-test')
mkdirSync(scratchRoot, { recursive: true })
const out = mkdtempSync(join(scratchRoot, 'tw-'))
buildTokens({ base, themes: { neutral: {} }, defaultTheme: 'neutral', outDir: out })
afterAll(() => rmSync(out, { recursive: true, force: true }))

const INPUT = `@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme) prefix(tw);
@import "tailwindcss/utilities.css" layer(utilities) prefix(tw);
@import ${JSON.stringify(join(out, 'theme.css'))};
`

const build = async (candidates: string[], input = INPUT) => {
  const compiler = await compile(input, { base: pkgRoot, onDependency: () => undefined })
  return compiler.build(candidates)
}

describe('theme.css compiled with Tailwind 4', () => {
  it('a tw:-prefixed utility resolves to the token', async () => {
    const css = await build(['tw:bg-primary-100', 'tw:p-section-m', 'tw:font-sans', 'tw:ease-base'])
    expect(css).toMatch(/\.tw\\:bg-primary-100 \{\s*background-color: var\(--zrm-color-primary-100\);/)
    expect(css).toMatch(/\.tw\\:p-section-m \{\s*padding: var\(--zrm-space-section-m\);/)
    expect(css).toMatch(/\.tw\\:font-sans \{\s*font-family: var\(--zrm-font-sans\);/)
    expect(css).toMatch(/\.tw\\:ease-base \{[^}]*transition-timing-function: var\(--zrm-motion-ease-base\);/)
  })

  it('a @md/page: container variant uses the page container at the md breakpoint', async () => {
    const css = await build(['tw:@md/page:p-section-s'])
    expect(css).toMatch(/@container page \(width >= 768px\) \{\s*\.tw\\:\\@md\\\/page\\:p-section-s \{\s*padding: var\(--zrm-space-section-s\);/)
  })

  it('control: an unprefixed utility produces nothing (the prefix is enforced)', async () => {
    const css = await build(['bg-primary-100', 'p-section-m'])
    expect(css).not.toContain('primary-100')
    expect(css).not.toContain('section-m')
  })

  it('declares the layer order, ships no Preflight and uses no !important', async () => {
    const css = await build(['tw:bg-primary-100', 'tw:@md/page:p-section-s', 'tw:text-h1'])
    expect(css).toContain('@layer theme, base, components, utilities;')
    expect(css).not.toContain('box-sizing: border-box')
    expect(css).not.toContain('!important')
    expect(css).not.toMatch(/(^|\n)\s*(html|body|h1|\*)[ ,{]/)
  })

  it('control: the Preflight and !important checks do see those when they are present', async () => {
    const css = await build(['tw:bg-primary-100'], INPUT + '@import "tailwindcss/preflight.css" layer(base);\n.x { color: red !important; }\n')
    expect(css).toContain('box-sizing: border-box')
    expect(css).toContain('!important')
  })

  it('names the easing token --ease-base, not --ease-ease-base', () => {
    const theme = readFileSync(join(out, 'theme.css'), 'utf8')
    expect(theme).toContain('--ease-base: var(--zrm-motion-ease-base);')
    expect(theme).not.toContain('--ease-ease-')
  })
})
