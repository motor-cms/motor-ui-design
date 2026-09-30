import { describe, expect, it } from 'vitest'
import * as entry from '@motor-cms/ui-design-styles'

describe('@motor-cms/ui-design-styles', () => {
  it('resolves by package name', () => {
    expect(entry.packageName).toBe('@motor-cms/ui-design-styles')
  })
})
