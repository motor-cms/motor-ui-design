import { describe, expect, it } from 'vitest'
import { headlineAtom } from '@motor-cms/ui-design-recipes'

const cls = (o: Parameters<typeof headlineAtom>[0] = {}) => headlineAtom(o).split(/\s+/)

describe('headlineAtom', () => {
  it('defaults to the regular h2', () => {
    const c = cls()
    expect(c).toContain('tw:text-h2')
    expect(c).toContain('tw:font-regular')
    expect(c).toContain('tw:mb-4')
    expect(c).toContain('tw:tracking-normal')
    expect(c).not.toContain('tw:tracking-[0.5px]')
  })

  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)('level %s sets the matching fluid size', (level) => {
    expect(cls({ level })).toContain(`tw:text-${level}`)
  })

  it('h6-grey keeps the size next to the colour', () => {
    const c = cls({ level: 'h6-grey' })
    expect(c).toContain('tw:text-h6')
    expect(c).toContain('tw:text-dark-95')
    expect(c).not.toContain('tw:text-dark-100')
  })

  it.each(['light', 'regular', 'medium', 'bold'] as const)('weight %s replaces the base weight', (weight) => {
    const c = cls({ weight })
    expect(c).toContain(`tw:font-${weight}`)
    expect(c.filter((x) => x.startsWith('tw:font-') && x !== 'tw:font-sans')).toEqual([`tw:font-${weight}`])
  })

  // One test per context value: the class it adds and what it replaces.
  it('context none changes nothing', () => {
    expect(cls({ context: 'none' })).toEqual(cls())
  })
  it('context flush drops the gap below', () => {
    const c = cls({ context: 'flush' })
    expect(c).toContain('tw:mb-0')
    expect(c).not.toContain('tw:mb-4')
  })
  it('context flush-pointer drops the gap and shows a pointer', () => {
    const c = cls({ context: 'flush-pointer' })
    expect(c).toContain('tw:mb-0')
    expect(c).toContain('tw:cursor-pointer')
    expect(c).not.toContain('tw:mb-4')
  })
  it('context centered centres the text', () => {
    expect(cls({ context: 'centered' })).toContain('tw:text-center')
  })
  it('context centered-vp centres from the vp container width on', () => {
    const c = cls({ context: 'centered-vp' })
    expect(c).toContain('tw:@vp/page:text-center')
    expect(c).not.toContain('tw:text-center')
  })
  it('context left aligns the text left', () => {
    expect(cls({ context: 'left' })).toContain('tw:text-left')
  })
  it('context hyphenated turns hyphenation on', () => {
    expect(cls({ context: 'hyphenated' })).toContain('tw:hyphens-auto')
  })
})
