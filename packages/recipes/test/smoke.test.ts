import { describe, expect, it } from 'vitest'
import * as entry from '@motor-cms/ui-design-recipes'

describe('@motor-cms/ui-design-recipes', () => {
  it('resolves by package name', () => {
    expect(entry.packageName).toBe('@motor-cms/ui-design-recipes')
  })
})
