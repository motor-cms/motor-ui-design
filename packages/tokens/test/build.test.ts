import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { base, buildTokens, flattenTokens, type ThemeOverrides } from '@motor-cms/ui-design-tokens'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = join(pkgRoot, 'node_modules', '.zrm-test')
mkdirSync(scratchRoot, { recursive: true })
const out = mkdtempSync(join(scratchRoot, 'build-'))

// "sunset" is the default theme, "ocean" overrides one key, "sunset" also overrides one so the fallback is not base.
const themes: Record<string, ThemeOverrides> = {
  sunset: { color: { 'primary-100': 'rgb(200, 10, 10)' } },
  ocean: { color: { 'primary-100': 'rgb(10, 10, 200)' } },
}
const files = buildTokens({ base, themes, defaultTheme: 'sunset', outDir: out })

const css = (name: string) => readFileSync(join(out, name), 'utf8')
const declarations = (block: string) => [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => m[1])

function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  expect(start, `selector ${selector} missing`).toBeGreaterThanOrEqual(0)
  return source.slice(start, source.indexOf('}', start))
}

describe('token build', () => {
  it('writes theme files, theme.css and admin-bridge.css', () => {
    expect(files.map((f) => f.split('/').pop()).sort()).toEqual(
      ['admin-bridge.css', 'theme-ocean.css', 'theme-sunset.css', 'theme.css'],
    )
  })

  it('a theme override emits only its own keys', () => {
    const body = ruleBody(css('theme-ocean.css'), ':root[data-theme="ocean"]')
    expect(declarations(body)).toEqual(['--zrm-color-primary-100'])
    expect(css('theme-ocean.css')).not.toContain('\n:root {')
  })

  it('the default theme sets the full merged set on :root', () => {
    const merged = declarations(ruleBody(css('theme-sunset.css'), ':root'))
    const expected = Object.keys(flattenTokens(base)).map((k) => `--zrm-${k}`)
    expect(merged.sort()).toEqual(expected.sort())
    expect(ruleBody(css('theme-sunset.css'), ':root')).toContain('--zrm-color-primary-100: rgb(200, 10, 10)')
  })

  it('rejects an override key that base does not define', () => {
    expect(() =>
      buildTokens({ base, themes: { x: { color: { nonsense: '#000' } } }, defaultTheme: 'x', outDir: out }),
    ).toThrow(/color\.nonsense/)
  })

  it('rejects an override of the global breakpoints', () => {
    expect(() =>
      buildTokens({ base, themes: { x: { breakpoint: { lg: '1px' } } }, defaultTheme: 'x', outDir: out }),
    ).toThrow(/breakpoint/)
  })

  it('carries both breakpoint sets as literals for media and container queries', () => {
    const theme = css('theme.css')
    for (const [name, px] of Object.entries({ sm: 576, md: 768, lg: 992, xl: 1200, '2xl': 1400, vp: 670, vpl: 1025, vpxl: 1441, vpxxl: 1920 })) {
      expect(theme).toContain(`--breakpoint-${name}: ${px}px;`)
      expect(theme).toContain(`--container-${name}: ${px}px;`)
    }
    expect(theme).toContain('--color-primary-100: var(--zrm-color-primary-100);')
    expect(theme).toMatch(/@theme inline \{/)
  })

  it('admin-bridge.css holds the primary ramp of the default theme', () => {
    const bridge = css('admin-bridge.css')
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(bridge).toContain(`--color-motor-primary-${step}:`)
    }
  })
})

describe('runtime resolution in Chromium', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch()
    writeFileSync(
      join(out, 'page.html'),
      `<!doctype html><link rel="stylesheet" href="theme-sunset.css"><link rel="stylesheet" href="theme-ocean.css"><body><div id="t"></div></body>`,
    )
  })
  afterAll(async () => {
    await browser?.close()
    rmSync(out, { recursive: true, force: true })
  })

  async function primary(dataTheme: string | null): Promise<string> {
    const page = await browser.newPage()
    await page.goto('file://' + join(out, 'page.html'))
    await page.evaluate((t) => t && document.documentElement.setAttribute('data-theme', t), dataTheme)
    const value = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--zrm-color-primary-100').trim())
    await page.close()
    return value
  }

  it('data-theme="ocean" resolves to the override', async () => {
    expect(await primary('ocean')).toBe('rgb(10, 10, 200)')
  })
  it('an unknown data-theme resolves to the default theme', async () => {
    expect(await primary('does-not-exist')).toBe('rgb(200, 10, 10)')
  })
  it('no data-theme resolves to the default theme', async () => {
    expect(await primary(null)).toBe('rgb(200, 10, 10)')
  })
})
