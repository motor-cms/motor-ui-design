import { describe, expect, it } from 'vitest'
import { cardComponent } from '@motor-cms/ui-design-recipes'

const parts = (o: Parameters<typeof cardComponent>[0] = {}) => {
  const s = cardComponent(o)
  return { base: s.base().split(/\s+/), image: s.image().split(/\s+/).filter(Boolean), body: s.body().split(/\s+/) }
}

describe('cardComponent', () => {
  it('starts from the block defaults', () => {
    expect(parts().base).toContain('tw:box-border')
    expect(parts().base).toContain('tw:font-sans')
  })
  it('the body overlaps the image, is translucent and blurred, and rounds its bottom corners only', () => {
    const { body } = parts()
    for (const c of ['tw:relative', 'tw:-mt-8', 'tw:p-6', 'tw:overflow-hidden', 'tw:rounded-b-sm', 'tw:bg-light-100-60', 'tw:backdrop-blur-md']) expect(body).toContain(c)
  })
  it('an image area with content has no height of its own', () => {
    expect(parts().image).toEqual(['tw:relative'])
  })
  it('an empty image area keeps a strip of its own', () => {
    expect(parts({ empty: true }).image).toContain('tw:h-9')
  })
})
