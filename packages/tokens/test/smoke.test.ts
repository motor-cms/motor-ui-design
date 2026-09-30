import { describe, expect, it } from 'vitest'
import * as entry from '@motor-cms/ui-design-tokens'

describe('@motor-cms/ui-design-tokens', () => {
  it('resolves by package name', () => {
    expect(entry.packageName).toBe('@motor-cms/ui-design-tokens')
  })
})
