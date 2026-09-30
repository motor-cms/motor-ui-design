#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { run } from './run.js'
import type { Mode, ParityConfig } from './types.js'

const USAGE = `motor-ui-parity --config <file> [--reference <dir>] [--blocks A,B] [--theme <name>] [--mode validate|gate]
                [--viewports 375,1440] [--report <dir>] [--scrollbar <px>] [--legacy-css-on-new] [--concurrency <n>] [--no-edge-report]`

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) return console.log(USAGE)
  const arg = (n: string) => {
    const i = args.indexOf(`--${n}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const known = new Set(['config', 'reference', 'blocks', 'theme', 'mode', 'viewports', 'report', 'scrollbar', 'legacy-css-on-new', 'concurrency', 'no-edge-report'])
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
    configFile,
    reference: arg('reference'),
    blocks: arg('blocks')?.split(',').filter(Boolean),
    theme: arg('theme'),
    viewports: arg('viewports')?.split(',').map(Number),
    reportDir: arg('report'),
    scrollbar: arg('scrollbar') ? Number(arg('scrollbar')) : undefined,
    legacyCssOnNew: args.includes('--legacy-css-on-new'),
    concurrency: arg('concurrency') ? Number(arg('concurrency')) : undefined,
    edgeReport: !args.includes('--no-edge-report'),
    log: (m) => console.log(m),
  })
  const t = summary.totals
  const byKey = new Map<string, { pass: number; fail: number; exempt: number; 'context-gap': number }>()
  for (const r of summary.results) {
    const x = byKey.get(r.key) ?? { pass: 0, fail: 0, exempt: 0, 'context-gap': 0 }
    x[r.status]++
    byKey.set(r.key, x)
  }
  for (const [k, x] of byKey) console.log(`  ${x.fail ? 'FAIL' : 'PASS'} ${k}: ${x.pass} pass, ${x.fail} fail, ${x.exempt} exempt${x['context-gap'] ? `, ${x['context-gap']} context gap (not a pass)` : ''}`)
  for (const m of summary.missing) console.log(`  MISSING ${m.key}: no ${m.what} implementation in the block map`)
  const shown = summary.results.filter((r) => r.status === 'fail').slice(0, 30)
  for (const r of shown) {
    const style = r.styleDiffs?.length ? ` [style: ${r.styleDiffs.slice(0, 3).map((d) => `${d.property} at ${d.path}: ${d.a} vs ${d.b}`).join('; ')}${(r.styleDiffCount ?? 0) > 3 ? `; +${r.styleDiffCount! - 3} more` : ''}]` : ''
    console.log(`  ${r.edge ? r.edge + ' ' : ''}${r.key} ${r.instance} @${r.viewport} ${r.state} (${r.comparison}): ${r.message}${style}`)
  }
  if (summary.results.filter((r) => r.status === 'fail').length > shown.length) console.log(`  ... ${summary.results.filter((r) => r.status === 'fail').length - shown.length} more failures in the report`)
  for (const k of summary.unusedContextGaps) console.log(`  STALE context-gap entry ${k}: no failing check matches it any more, remove it`)
  const e = summary.edgeReport
  if (e) {
    console.log(`  edge report (informational, scrollbar ${e.scrollbar}px, NOT part of the verdict): ${e.checks} checks at the breakpoint edges, ${e.differ} differ`)
    for (const r of e.results.slice(0, 30)) console.log(`    ${r.edge ? r.edge + ' ' : ''}${r.key} ${r.instance} @${r.viewport} ${r.state} (${r.comparison}): ${r.message}`)
    if (e.results.length > 30) console.log(`    ... ${e.results.length - 30} more in the report`)
  }
  const gaps = t.contextGap ? `, ${t.contextGap} context gap (not a pass)` : ''
  // A narrowed or altered run never reads like the full contract run.
  const verdict = summary.ok ? (summary.partial.length ? 'PARTIAL OK' : 'OK') : summary.partial.length ? 'FAILED (partial run)' : 'FAILED'
  console.log(`${summary.mode}: ${verdict}: ${t.checks} checks, ${t.pass} pass, ${t.fail} fail, ${t.exempt} exempt${gaps}, ${t.skipped} skipped, ${t.missing} missing; ${summary.seconds}s`)
  if (summary.partial.length) console.log(`  PARTIAL, not a parity result: ${summary.partial.join('; ')}`)
  process.exitCode = summary.ok ? 0 : 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(2)
})
