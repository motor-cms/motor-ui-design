import { describe, expect, it } from 'vitest'
import * as entry from '@motor-cms/ui-design-blocks'

describe('@motor-cms/ui-design-blocks', () => {
  it('resolves by package name', () => {
    expect(entry.packageName).toBe('@motor-cms/ui-design-blocks')
  })
})
