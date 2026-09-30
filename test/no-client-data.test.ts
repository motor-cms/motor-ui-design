import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Core is public and neutral (DECISIONS 15): no client names, brand values,
// client fonts or captured data. The list is case-insensitive.
const FORBIDDEN = ['energis', 'jaeckel', 'jäckel', 'highspeed', 'bruxmeier', 'Satoshi', 'Kalam', '#F49B01']
const SELF = 'test/no-client-data.test.ts'
const root = resolve(__dirname, '..')

function candidateFiles(): string[] {
  // Tracked plus untracked-but-not-ignored, so a new file is caught before it is committed.
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\0')
    .filter(Boolean)
    .filter((f) => f !== SELF && !f.startsWith('node_modules/') && !f.startsWith('.git/'))
}

describe('core carries no client data', () => {
  it('scans a non-empty file list', () => {
    expect(candidateFiles().length).toBeGreaterThan(5)
  })

  it('contains none of the forbidden terms', () => {
    const hits: string[] = []
    for (const file of candidateFiles()) {
      let text: string
      try {
        text = readFileSync(resolve(root, file), 'utf8').toLowerCase()
      } catch {
        continue // deleted in the working tree but still in the index
      }
      for (const term of FORBIDDEN) {
        if (text.includes(term.toLowerCase())) hits.push(`${file}: ${term}`)
      }
    }
    expect(hits, `client data found in:\n${hits.join('\n')}`).toEqual([])
  })
})
