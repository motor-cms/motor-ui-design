import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Release builds run `pnpm test`, which launches Chromium (tokens build test, harness tests): the runner needs it
// installed first, as in test.yml (review I5).
const dir = resolve(__dirname, '../.github/workflows')

describe.each(['test.yml', 'release.yml', 'release-production.yml'])('%s', (name) => {
  const src = readFileSync(resolve(dir, name), 'utf8')
  it('installs Playwright Chromium before pnpm test', () => {
    const install = src.indexOf('playwright install')
    const test = src.indexOf('run: pnpm test')
    expect(install, 'no playwright install').toBeGreaterThanOrEqual(0)
    expect(test, 'no pnpm test step').toBeGreaterThanOrEqual(0)
    expect(install).toBeLessThan(test)
  })
})
