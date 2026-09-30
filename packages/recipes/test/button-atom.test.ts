import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { afterAll, describe, expect, it } from 'vitest'
import { base, buildTokens } from '@motor-cms/ui-design-tokens'
import { buttonAtom } from '@motor-cms/ui-design-recipes'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = join(pkgRoot, 'node_modules', '.zrm-test')
mkdirSync(scratchRoot, { recursive: true })
const out = mkdtempSync(join(scratchRoot, 'button-'))
buildTokens({ base, themes: { neutral: {} }, defaultTheme: 'neutral', outDir: out })
afterAll(() => rmSync(out, { recursive: true, force: true }))

type Opts = Parameters<typeof buttonAtom>[0]
const parts = (o: Opts = {}) => {
  const s = buttonAtom(o)
  return { base: s.base().split(/\s+/), inner: s.inner().split(/\s+/), label: s.label().split(/\s+/), icon: s.icon().split(/\s+/) }
}

describe('buttonAtom', () => {
  it('defaults to the dark pill', () => {
    const { base, label } = parts()
    for (const c of ['tw:bg-dark-100', 'tw:text-light-100', 'tw:rounded-full', 'tw:text-sm', 'tw:leading-5', 'tw:mt-6', 'tw:hover:bg-primary-100']) expect(base).toContain(c)
    expect(base).toContain('tw:tracking-[0.5px]')
    expect(label).toContain('tw:group-hover/btn:text-dark-100')
  })

  it.each([
    ['dark', 'tw:bg-dark-100'],
    ['light', 'tw:bg-light-100'],
    ['primary', 'tw:bg-primary-100'],
    ['blur', 'tw:bg-light-100-60'],
    ['inactive', 'tw:bg-dark-40'],
    ['disabled', 'tw:pointer-events-none'],
    ['link', 'tw:underline'],
    ['ghost', 'tw:border-dark-100'],
  ] as const)('variant %s', (variant, cls) => {
    const { base } = parts({ variant })
    expect(base).toContain(cls)
  })
  it('variant blur blurs what is behind it and swaps to the translucent accent', () => {
    const { base } = parts({ variant: 'blur' })
    expect(base).toContain('tw:backdrop-blur-md')
    expect(base).toContain('tw:hover:bg-primary-100-alpha-60')
  })
  it('variant primary swaps the label to light on hover', () => {
    expect(parts({ variant: 'primary' }).label).toContain('tw:group-hover/btn:text-light-100')
  })
  it('variant link drops the pill', () => {
    const { base } = parts({ variant: 'link' })
    expect(base).toContain('tw:rounded-none')
    expect(base).toContain('tw:p-0')
    expect(base).not.toContain('tw:p-0.5')
  })
  it('variant small tightens the inner padding', () => {
    const { inner } = parts({ variant: 'small' })
    expect(inner).toContain('tw:py-0.5')
    expect(inner).not.toContain('tw:py-3.5')
  })
  it('variant checkout is a flex box with its own padding and radius', () => {
    const { base, label, icon } = parts({ variant: 'checkout' })
    expect(base).toContain('tw:flex')
    expect(base).toContain('tw:rounded-sm')
    expect(base).not.toContain('tw:rounded-full')
    expect(label).toContain('tw:text-lg')
    expect(icon).toContain('tw:m-0')
  })
  it('variant checkout-next-step sets a minimum width', () => {
    expect(parts({ variant: 'checkout-next-step' }).base).toContain('tw:min-w-75')
  })

  // One test per context value.
  it('context none changes nothing', () => expect(parts({ context: 'none' })).toEqual(parts()))
  it('context inline-centered centres the text and is inline from the vpl width on', () => {
    const { base } = parts({ context: 'inline-centered' })
    expect(base).toContain('tw:text-center')
    expect(base).toContain('tw:@vpl/page:inline-block')
  })
  it('context hyphenated turns hyphenation on', () => expect(parts({ context: 'hyphenated' }).base).toContain('tw:hyphens-auto'))
  it('context shifted is static and moved', () => {
    const { base } = parts({ context: 'shifted' })
    expect(base).toContain('tw:static')
    expect(base).toContain('tw:translate-x-4')
    expect(base).toContain('tw:-translate-y-23')
  })
  it('context corner sits in the bottom left corner', () => {
    const { base } = parts({ context: 'corner' })
    for (const c of ['tw:absolute', 'tw:bottom-4', 'tw:left-4']) expect(base).toContain(c)
  })
  it('context static-left is static and left-aligned', () => {
    const { base } = parts({ context: 'static-left' })
    expect(base).toContain('tw:static')
    expect(base).toContain('tw:text-left')
  })
  it('context gap-below adds a gap below', () => expect(parts({ context: 'gap-below' }).base).toContain('tw:mb-4'))

  it('every class generates the declaration it stands for', async () => {
    const input = `@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme) prefix(tw);
@import "tailwindcss/utilities.css" layer(utilities) prefix(tw);
@import ${JSON.stringify(join(out, 'theme.css'))};
`
    const all = Object.values(parts({ variant: 'dark', context: 'shifted' })).flat()
    const css = (await compile(input, { base: pkgRoot, onDependency: () => undefined })).build(all)
    expect(css).toMatch(/border-radius: calc\(infinity \* 1px\)|border-radius: 3\.40282e38px|border-radius: 33554428px/)
    expect(css).toMatch(/outline-style: solid|--tw-outline-style: solid/)
    expect(css).toMatch(/-webkit-text-stroke: 0\.4px currentcolor/)
    expect(css).toMatch(/group-hover\\\/btn|group\\\/btn/)
    expect(css).toMatch(/background-color: var\(--zrm-color-dark-100\)/)
  })
})
