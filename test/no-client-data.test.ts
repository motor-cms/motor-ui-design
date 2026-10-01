import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Core is public and neutral (DECISIONS 15). This guard is structural: it names no client, brand value or font. It
// fails on the shapes that client data comes in: captured reference packs, screenshots, captured or compiled page
// markup and CSS, font files. The values themselves (client names, brand colours in any notation, fonts, captured
// classes) are checked where the client data lives, by the private layer's test, which scans this repository.
const root = resolve(__dirname, '..')

// The synthetic fixture of the harness is the one place that legitimately has a reference pack, markup and CSS.
const FIXTURE = 'packages/harness/test/fixture/'
const SCREENSHOT = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$/i
const FONT = /\.(ttf|otf|woff2?|eot)$/i
const PACK_DIR = /(^|\/)(reference|_assets|_definitions|_images)\//
const PACK_FILE = /(^|\/)(outer(-\d+)?\.html|capture\.json|fixture\.json|frontend(\.[\w-]+)?\.css)$/
// The harness page itself is the only other HTML document.
const HTML_ALLOWED = new Set(['packages/harness/app/index.html'])
// Hand-written generic sheets of the styles package (DECISIONS 6: stored helper classes such as fw-*), top level only.
// Their values are checked by the private layer's scan like every other file here.
const STYLES_SRC_CSS = /^packages\/styles\/src\/[^/]+\.css$/

// `sources.css` of a package only tells Tailwind where to look (`@source`, `@import`); it holds no declaration, so it
// holds no value. Allowed by content, not by name: a rule or a custom property in it is still compiled CSS.
const SOURCES_CSS = /^packages\/[^/]+\/sources\.css$/
const onlySourceDirectives = (css: string): boolean =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .every((l) => /^@(source|import)\s+"[^"{};]*";$/.test(l))

const violations = (files: string[]): string[] => {
  const out: string[] = []
  for (const f of files) {
    if (f.startsWith(FIXTURE)) continue
    const why: string[] = []
    if (PACK_DIR.test(f) || PACK_FILE.test(f)) why.push('captured reference pack')
    if (SCREENSHOT.test(f)) why.push('image/screenshot')
    if (FONT.test(f)) why.push('font file')
    if (/\.html?$/i.test(f) && !HTML_ALLOWED.has(f)) why.push('captured or compiled HTML')
    if (/\.css$/i.test(f) && !STYLES_SRC_CSS.test(f) && !(SOURCES_CSS.test(f) && onlySourceDirectives(readFileSync(resolve(root, f), 'utf8'))))
      why.push('compiled CSS')
    if (why.length) out.push(`${f}: ${why.join(', ')}`)
  }
  return out
}

function candidateFiles(): string[] {
  // Tracked plus untracked-but-not-ignored, so a new file is caught before it is committed.
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\0').filter(Boolean)
}

describe('core carries no client data (structural)', () => {
  it('scans a non-empty file list', () => {
    expect(candidateFiles().length).toBeGreaterThan(5)
  })

  it('has no reference pack, screenshot, captured markup, compiled CSS or font file outside the synthetic fixture and the styles sources', () => {
    const hits = violations(candidateFiles())
    expect(hits, `client-shaped data found:\n${hits.join('\n')}`).toEqual([])
  })

  it('break-it: the predicate flags every shape and spares the synthetic fixture, the harness page and the styles sources', () => {
    const bad = [
      'reference/ButtonAtom/abc/outer.html',
      'packages/x/reference/ButtonAtom/abc/375.png',
      'docs/screens/home.png',
      'assets/fonts/Brand-Variable.woff2',
      'dist-copy/theme-brand.css',
      'snapshots/page.html',
      'somewhere/capture.json',
      'somewhere/frontend.css',
      '_assets/_nuxt/entry.css',
      'packages/styles/dist/weights.css',
      'packages/styles/src/captured/frontend-page.css',
      'packages/blocks/src/weights.css',
      'packages/styles/src/frontend.css',
    ]
    for (const f of bad) expect(violations([f]), f).toHaveLength(1)
    const ok = [
      'packages/harness/test/fixture/reference/DemoBlock/demo-1/outer.html',
      'packages/harness/test/fixture/reference/frontend.css',
      'packages/harness/test/fixture/theme.css',
      'packages/harness/app/index.html',
      'packages/styles/src/weights.css',
      'packages/tokens/src/base.json',
      'README.md',
    ]
    expect(violations(ok)).toEqual([])
  })

  it('break-it: a sources.css passes only while it holds @source and @import lines', () => {
    expect(onlySourceDirectives('/* c */\n@import "pkg/sources.css";\n@source "./dist";\n')).toBe(true)
    expect(onlySourceDirectives('@source "./dist";\n.tw\\:x { color: red; }\n')).toBe(false)
    expect(onlySourceDirectives('@source "./dist";\n:root { --c: #fff; }\n')).toBe(false)
    expect(onlySourceDirectives('@import url("x.css");\n')).toBe(false)
  })
})
