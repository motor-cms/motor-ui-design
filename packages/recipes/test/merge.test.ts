import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { tv, twMergeConfig } from '@motor-cms/ui-design-recipes'
import { createTV } from 'tailwind-variants'
import { base } from '@motor-cms/ui-design-tokens'

// The recipes merge conflicting utilities with tailwind-merge (prefix `tw`). Its default knows no token names, so it reads
// the font-size token `tw:text-h2` as a colour and drops it when a colour follows. The configuration registers the token
// scales; these tests pin what that buys and show the default failing where the configured one does not.
const plain = createTV({ twMerge: true, twMergeConfig: { prefix: 'tw' } })

describe('tailwind-merge configuration of the recipes', () => {
  it('control: tailwind-merge with only the prefix drops a custom font-size next to a colour', () => {
    expect(plain({ base: 'tw:text-h2 tw:text-dark-100' })()).toBe('tw:text-dark-100')
  })

  it('a custom font-size survives next to a colour', () => {
    expect(tv({ base: 'tw:text-h2 tw:text-dark-100' })()).toBe('tw:text-h2 tw:text-dark-100')
    expect(tv({ base: 'tw:text-dark-100 tw:text-overline' })()).toBe('tw:text-dark-100 tw:text-overline')
  })

  it('a variant colour replaces the base colour, the font-size stays', () => {
    const r = tv({
      base: 'tw:text-h6 tw:text-dark-100',
      variants: { tone: { grey: 'tw:text-dark-95' } },
    })
    expect(r({ tone: 'grey' })).toBe('tw:text-h6 tw:text-dark-95')
  })

  it('a custom font-size replaces another font-size', () => {
    expect(tv({ base: 'tw:text-h1', variants: { size: { small: 'tw:text-h6' } } })({ size: 'small' })).toBe('tw:text-h6')
  })

  it('token weights, spacing and shadow merge as their own groups', () => {
    const r = tv({
      base: 'tw:font-regular tw:mb-section-m tw:shadow-base tw:text-dark-100',
      variants: { v: { x: 'tw:font-bold tw:mb-0 tw:shadow-small' } },
    })
    expect(r({ v: 'x' })).toBe('tw:text-dark-100 tw:font-bold tw:mb-0 tw:shadow-small')
  })

  it('a token weight and a token font family do not replace each other', () => {
    expect(tv({ base: 'tw:font-sans tw:font-bold' })()).toBe('tw:font-sans tw:font-bold')
  })

  it('a responsive variant does not replace its unconditioned base', () => {
    expect(tv({ base: 'tw:text-h3 tw:@md/page:text-h2' })()).toBe('tw:text-h3 tw:@md/page:text-h2')
  })

  it('the registered names are the ones the token schema generates (drift guard)', () => {
    const keys = (group: string, keep: (k: string) => boolean = () => true) => Object.keys(base[group]).filter(keep)
    const t = twMergeConfig.extend.theme
    expect(t.text).toEqual(keys('text', (k) => k.endsWith('-min')).map((k) => k.slice(0, -4)))
    expect(t['font-weight']).toEqual(keys('weight'))
    expect(t.spacing).toEqual(keys('space'))
    expect(t.shadow).toEqual(keys('shadow'))
    expect(t.ease).toEqual(keys('motion', (k) => k.startsWith('ease-')).map((k) => k.slice(5)))
  })

  it('the registered font-sizes are the ones theme.css generates', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tokens', 'dist', 'theme.css'), 'utf8')
    const generated = [...css.matchAll(/^\s*--text-([a-z0-9]+):/gm)].map((m) => m[1])
    expect(generated.length).toBeGreaterThan(0)
    expect([...twMergeConfig.extend.theme.text].sort()).toEqual([...generated].sort())
  })
})
