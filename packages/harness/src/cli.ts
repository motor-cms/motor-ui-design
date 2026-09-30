#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { run } from './run.js'
import type { Mode, ParityConfig } from './types.js'

const USAGE = `motor-ui-parity --config <file> [--reference <dir>] [--blocks A,B] [--theme <name>] [--mode validate|gate]
                [--viewports 375,1440] [--report <dir>] [--scrollbar <px>] [--legacy-css-on-new] [--concurrency <n>]`

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) return console.log(USAGE)
  const arg = (n: string) => {
    const i = args.indexOf(`--${n}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const known = new Set(['config', 'reference', 'blocks', 'theme', 'mode', 'viewports', 'report', 'scrollbar', 'legacy-css-on-new', 'concurrency'])
  for (const a of args.filter((x) => x.startsWith('--'))) if (!known.has(a.slice(2))) throw new Error(`unknown flag ${a}\n${USAGE}`)
  const mode = (arg('mode') ?? 'gate') as Mode
  if (mode !== 'validate' && mode !== 'gate') throw new Error(`--mode must be validate or gate\n${USAGE}`)
  const cwd = process.cwd()
  const configFile = resolve(cwd, arg('config') ?? 'parity.config.mjs')
  if (!existsSync(configFile)) throw new Error(`config file ${configFile} does not exist\n${USAGE}`)
  const config = ((await import(pathToFileURL(configFile).href)) as { default: ParityConfig }).default
  const summary = await run({
    mode,
    config,
    configDir: dirname(configFile),
    cwd,
    reference: arg('reference'),
    blocks: arg('blocks')?.split(',').filter(Boolean),
    theme: arg('theme'),
    viewports: arg('viewports')?.split(',').map(Number),
    reportDir: arg('report'),
    scrollbar: arg('scrollbar') ? Number(arg('scrollbar')) : undefined,
    legacyCssOnNew: args.includes('--legacy-css-on-new'),
    concurrency: arg('concurrency') ? Number(arg('concurrency')) : undefined,
    log: (m) => console.log(m),
  })
  const t = summary.totals
  const byKey = new Map<string, { pass: number; fail: number; exempt: number }>()
  for (const r of summary.results) {
    const x = byKey.get(r.key) ?? { pass: 0, fail: 0, exempt: 0 }
    x[r.status]++
    byKey.set(r.key, x)
  }
  for (const [k, x] of byKey) console.log(`  ${x.fail ? 'FAIL' : 'PASS'} ${k}: ${x.pass} pass, ${x.fail} fail, ${x.exempt} exempt`)
  for (const m of summary.missing) console.log(`  MISSING ${m.key}: no ${m.what} implementation in the block map`)
  const shown = summary.results.filter((r) => r.status === 'fail').slice(0, 30)
  for (const r of shown) {
    const style = r.styleDiffs?.length ? ` [style: ${r.styleDiffs.slice(0, 3).map((d) => `${d.property} at ${d.path}: ${d.a} vs ${d.b}`).join('; ')}${(r.styleDiffCount ?? 0) > 3 ? `; +${r.styleDiffCount! - 3} more` : ''}]` : ''
    console.log(`  ${r.edge ? r.edge + ' ' : ''}${r.key} ${r.instance} @${r.viewport} ${r.state} (${r.comparison}): ${r.message}${style}`)
  }
  if (summary.results.filter((r) => r.status === 'fail').length > shown.length) console.log(`  ... ${summary.results.filter((r) => r.status === 'fail').length - shown.length} more failures in the report`)
  console.log(`${summary.mode}: ${summary.ok ? 'OK' : 'FAILED'}: ${t.checks} checks, ${t.pass} pass, ${t.fail} fail, ${t.exempt} exempt, ${t.skipped} skipped, ${t.missing} missing; ${summary.seconds}s`)
  process.exitCode = summary.ok ? 0 : 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(2)
})
