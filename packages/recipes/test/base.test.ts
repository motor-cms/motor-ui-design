import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { afterAll, describe, expect, it } from 'vitest'
import { base, buildTokens } from '@motor-cms/ui-design-tokens'
import { blockBase, tv } from '@motor-cms/ui-design-recipes'

// The shared block base: what it says, that a block can override it by merge, and that Tailwind generates CSS for every
// class in it (a typo in a class name would otherwise produce nothing and fail no test).
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = join(pkgRoot, 'node_modules', '.zrm-test')
mkdirSync(scratchRoot, { recursive: true })
const out = mkdtempSync(join(scratchRoot, 'base-'))
buildTokens({ base, themes: { neutral: {} }, defaultTheme: 'neutral', outDir: out })
afterAll(() => rmSync(out, { recursive: true, force: true }))

const compileCss = async (candidates: string[]) => {
  const input = `@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme) prefix(tw);
@import "tailwindcss/utilities.css" layer(utilities) prefix(tw);
@import ${JSON.stringify(join(out, 'theme.css'))};
`
  return (await compile(input, { base: pkgRoot, onDependency: () => undefined })).build(candidates)
}

describe('blockBase', () => {
  it('carries the page defaults', () => {
    const cls = blockBase()
    for (const c of ['tw:box-border', 'tw:font-sans', 'tw:font-regular', 'tw:text-dark-100', 'tw:antialiased', 'tw:[font-synthesis:none]', 'tw:leading-[158%]', 'tw:tracking-[0.5px]']) {
      expect(cls.split(/\s+/)).toContain(c)
    }
  })

  it('every class generates the declaration it stands for', async () => {
    const css = await compileCss(blockBase().split(/\s+/))
    expect(css).toMatch(/box-sizing: border-box/)
    expect(css).toMatch(/font-family: var\(--zrm-font-sans\)/)
    expect(css).toMatch(/font-weight: var\(--zrm-weight-regular\)/)
    expect(css).toMatch(/color: var\(--zrm-color-dark-100\)/)
    expect(css).toMatch(/-webkit-font-smoothing: antialiased/)
    expect(css).toMatch(/text-rendering: optimizeLegibility/)
    expect(css).toMatch(/font-synthesis: none/)
    expect(css).toMatch(/line-height: 158%/)
    expect(css).toMatch(/letter-spacing: 0\.5px/)
  })

  it('control: a misspelt class generates nothing, so the check above can fail', async () => {
    expect(await compileCss(['tw:font-synthesis-none-typo'])).not.toContain('font-synthesis')
  })

  it('a block overrides the base by merge and keeps its own font-size token', () => {
    const headline = tv({
      extend: blockBase,
      base: 'tw:text-h6 tw:tracking-normal',
      variants: { tone: { grey: 'tw:text-dark-95' }, weight: { bold: 'tw:font-bold' } },
    })
    const cls = headline({ tone: 'grey', weight: 'bold' }).split(/\s+/)
    expect(cls).toContain('tw:text-h6')
    expect(cls).toContain('tw:text-dark-95')
    expect(cls).not.toContain('tw:text-dark-100')
    expect(cls).toContain('tw:font-bold')
    expect(cls).not.toContain('tw:font-regular')
    expect(cls).toContain('tw:tracking-normal')
    expect(cls).not.toContain('tw:tracking-[0.5px]')
    expect(cls).toContain('tw:font-sans')
  })
})
