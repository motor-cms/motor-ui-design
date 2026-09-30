import { describe, expect, it } from 'vitest'
import { rowGrid } from '@motor-cms/ui-design-recipes'

const s = rowGrid

describe('rowGrid', () => {
  it('the container is centred, capped and padded on both sides', () => {
    const base = s().base().split(/\s+/)
    for (const c of ['tw:box-border', 'tw:w-full', 'tw:max-w-page', 'tw:mx-auto', 'tw:px-4']) expect(base).toContain(c)
  })
  it('the row pulls the half gutters of its columns back out', () => {
    const row = s().row().split(/\s+/)
    for (const c of ['tw:flex', 'tw:flex-wrap', 'tw:-mx-2', 'tw:-mt-2']) expect(row).toContain(c)
  })
  it('a column is full width with half gutters and a gap above, and does not shrink', () => {
    const col = s().column().split(/\s+/)
    for (const c of ['tw:box-border', 'tw:w-full', 'tw:shrink-0', 'tw:px-2', 'tw:mt-2']) expect(col).toContain(c)
  })
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const)('span %i takes its twelfths from the lg container width on', (span) => {
    expect(s({ span }).column()).toContain(`tw:@lg/page:w-${span}/12`)
  })
  it('the default span is 12', () => {
    expect(s().column()).toContain('tw:@lg/page:w-12/12')
  })
})
