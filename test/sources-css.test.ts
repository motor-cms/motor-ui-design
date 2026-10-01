import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Consumers `@import "<package>/sources.css"` so Tailwind finds the `tw:` classes of the blocks and recipes without a
// path into core. The file travels in the tarball, so everything it points at must travel too: a recipes package that
// shipped `dist` only and a sources.css pointing at `src` would build fine here and generate nothing for a consumer.
const root = resolve(__dirname, '..')

type Pkg = { dir: string; name: string; exports: Record<string, unknown>; dependencies?: Record<string, string> }
const packages: Pkg[] = ['blocks', 'recipes'].map((p) => {
  const dir = join(root, 'packages', p)
  return { dir, ...JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }
})

/** Paths the tarball will contain, relative to the package, as `npm pack` computes them. */
const shipped = (dir: string): string[] => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8' })
  return (JSON.parse(out)[0].files as { path: string }[]).map((f) => f.path)
}

/** `@source` and `@import` targets of a sources.css. */
const directives = (css: string): { source: string[]; imports: string[] } => ({
  source: [...css.matchAll(/^@source\s+"([^"]+)";/gm)].map((m) => m[1]),
  imports: [...css.matchAll(/^@import\s+"([^"]+)";/gm)].map((m) => m[1]),
})

/** Names of a shipped path set that a relative `@source` covers (a file, or a directory with something in it). */
const covers = (files: string[], rel: string): boolean => {
  const p = rel.replace(/^\.\//, '').replace(/\/$/, '')
  return files.some((f) => f === p || f.startsWith(`${p}/`))
}

describe.each(packages)('$name sources.css', (pkg) => {
  const file = join(pkg.dir, 'sources.css')
  const files = shipped(pkg.dir)

  it('is exported and shipped', () => {
    expect(pkg.exports['./sources.css']).toBe('./sources.css')
    expect(files).toContain('sources.css')
  })

  it('points only at things the package ships, and imports only its own dependencies', () => {
    const { source, imports } = directives(readFileSync(file, 'utf8'))
    expect(source.length, 'no @source line').toBeGreaterThan(0)
    for (const s of source) {
      expect(s.startsWith('./'), `${s} must be relative to the package`).toBe(true)
      expect(covers(files, s), `@source "${s}" points at nothing in the tarball`).toBe(true)
    }
    for (const i of imports) {
      const name = i.replace(/\/sources\.css$/, '')
      expect(Object.keys(pkg.dependencies ?? {}), `@import "${i}" is not a dependency`).toContain(name)
      expect(existsSync(join(root, 'packages', name.split('/ui-design-')[1], 'sources.css')), i).toBe(true)
    }
  })

  it('break-it: the check fails for a path the tarball lacks', () => {
    expect(covers(files, './src-that-is-not-shipped')).toBe(false)
    expect(covers(['dist/index.js'], './src')).toBe(false)
  })
})

describe('the blocks package reaches the recipes classes', () => {
  it('blocks/sources.css imports recipes/sources.css, whose @source covers the shipped dist', () => {
    const blocks = directives(readFileSync(join(packages[0].dir, 'sources.css'), 'utf8'))
    expect(blocks.imports).toContain('@motor-cms/ui-design-recipes/sources.css')
    expect(directives(readFileSync(join(packages[1].dir, 'sources.css'), 'utf8')).source).toContain('./dist')
  })
})
