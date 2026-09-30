import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EDGES } from './browser.js'
import type { CheckResult, RunSummary } from './types.js'

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const CMP: Record<string, string> = { 'reference-vs-legacy': 'reference PNG vs legacy render', 'frontend-vs-legacy': 'frontend vs legacy', 'builder-vs-frontend': 'builder vs frontend' }

const status = (r: CheckResult) => (r.status === 'pass' ? 'pass' : r.status === 'exempt' ? 'exempt' : r.status === 'context-gap' ? 'context-gap' : 'FAIL')

/** Per block: for each breakpoint edge, the result at both sides (worst state wins, fail > exempt > pass). */
export const edgeTable = (results: CheckResult[]) => {
  const rank = { pass: 0, exempt: 1, 'context-gap': 1, fail: 2 } as const
  const rows: { key: string; comparison: string; edge: string; a: string; b: string }[] = []
  const groups = new Map<string, CheckResult[]>()
  for (const r of results) groups.set(`${r.key}|${r.comparison}`, [...(groups.get(`${r.key}|${r.comparison}`) ?? []), r])
  for (const [g, rs] of groups) {
    const [key, comparison] = g.split('|')
    for (const [lo, hi] of EDGES) {
      const at = (vp: number) => {
        const x = rs.filter((r) => r.viewport === vp)
        if (!x.length) return 'n/a'
        return status(x.reduce((w, r) => (rank[r.status] > rank[w.status] ? r : w)))
      }
      rows.push({ key, comparison, edge: `${lo}/${hi}`, a: at(lo), b: at(hi) })
    }
  }
  return rows
}

export const writeReport = (dir: string, s: RunSummary) => {
  // machine-readable summary (styleDiffs are capped per check)
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(s, null, 2) + '\n')

  const blocks = new Map<string, CheckResult[]>()
  for (const r of s.results) blocks.set(r.key, [...(blocks.get(r.key) ?? []), r])
  const failures = s.results.filter((r) => r.status !== 'pass')

  const h: string[] = []
  h.push(`<!doctype html><meta charset="utf-8"><title>parity ${esc(s.mode)}</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;margin:8px 0 24px}td,th{border:1px solid #ccc;padding:3px 8px;text-align:left;vertical-align:top}
.FAIL{color:#b00020;font-weight:600}.pass{color:#1b7f3b}.exempt,.context-gap,.PARTIAL{color:#8a6d00;font-weight:600}.n\\/a{color:#888}img{border:1px solid #ccc;max-width:420px;background:#fff}.imgs{display:flex;gap:8px;flex-wrap:wrap}
code{background:#f3f3f3;padding:0 3px}details{margin:6px 0}</style>`)
  h.push(`<h1>Parity ${esc(s.mode)}: ${s.ok ? (s.partial.length ? '<span class="PARTIAL">PARTIAL OK</span>' : '<span class="pass">OK</span>') : '<span class="FAIL">FAILED</span>'}</h1>`)
  if (s.partial.length) {
    h.push('<p class="PARTIAL">Not the full contract run, this is not a parity result:</p><ul>' + s.partial.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>')
  }
  h.push(`<p>Reference <code>${esc(s.reference)}</code>, theme <code>${esc(s.theme)}</code>, scrollbar ${s.scrollbar}px, tolerance threshold ${s.tolerance.threshold} / maxDiffPixelRatio ${s.tolerance.maxDiffPixelRatio}, ${s.seconds}s.</p>`)
  h.push(`<p>${s.totals.checks} checks: ${s.totals.pass} pass, ${s.totals.fail} fail, ${s.totals.exempt} exempt, ${s.totals.contextGap} context gap (validate only, not a pass); ${s.totals.skipped} state/viewport combinations not in the reference (skipped); ${s.totals.missing} missing implementation(s).</p>`)
  if (s.missing.length) {
    h.push('<h2>Missing implementations</h2><ul>' + s.missing.map((m) => `<li class="FAIL">${esc(m.key)}: no ${m.what} implementation in the block map</li>`).join('') + '</ul>')
  }
  if (s.unusedContextGaps.length) {
    h.push('<h2>Stale context-gap entries</h2><p>Listed in the context-gap file but no failing check matched them any more: remove them.</p><ul>' + s.unusedContextGaps.map((k) => `<li>${esc(k)}</li>`).join('') + '</ul>')
  }
  h.push('<h2>Blocks</h2><table><tr><th>block</th><th>comparison</th><th>checks</th><th>pass</th><th>fail</th><th>exempt</th><th>context gap</th></tr>')
  for (const [k, rs] of blocks) {
    for (const c of new Set(rs.map((r) => r.comparison))) {
      const x = rs.filter((r) => r.comparison === c)
      h.push(`<tr><td>${esc(k)}</td><td>${esc(CMP[c])}</td><td>${x.length}</td><td>${x.filter((r) => r.status === 'pass').length}</td><td class="${x.some((r) => r.status === 'fail') ? 'FAIL' : ''}">${x.filter((r) => r.status === 'fail').length}</td><td>${x.filter((r) => r.status === 'exempt').length}</td><td>${x.filter((r) => r.status === 'context-gap').length}</td></tr>`)
    }
  }
  h.push('</table>')

  h.push('<h2>Breakpoint edges</h2><p>Each edge is reported at both sides. A container query sees the width without the scrollbar, a viewport media query includes it: a difference only at an edge is a scrollbar effect, not a generic diff.</p>')
  h.push('<table><tr><th>block</th><th>comparison</th><th>edge</th><th>lower side</th><th>upper side</th></tr>')
  for (const r of edgeTable(s.results)) h.push(`<tr><td>${esc(r.key)}</td><td>${esc(CMP[r.comparison])}</td><td>edge ${r.edge}</td><td class="${r.a}">${r.a}</td><td class="${r.b}">${r.b}</td></tr>`)
  h.push('</table>')

  if (s.edgeReport) {
    const e = s.edgeReport
    h.push(`<h2>Breakpoint edges with a ${e.scrollbar}px scrollbar (informational, not part of the verdict)</h2><p>The verdict pass runs with no scrollbar. This extra pass narrows the page container by ${e.scrollbar}px, as a classic scrollbar does, over the viewports at the breakpoint edges: ${e.checks} checks, ${e.differ} differ. A difference here that the verdict pass does not have is a container-query-versus-media-query effect to resolve before converting queries.</p>`)
    h.push('<table><tr><th>block</th><th>comparison</th><th>edge</th><th>lower side</th><th>upper side</th></tr>')
    for (const r of e.rows) h.push(`<tr><td>${esc(r.key)}</td><td>${esc(CMP[r.comparison])}</td><td>edge ${r.edge}</td><td class="${r.a}">${r.a}</td><td class="${r.b}">${r.b}</td></tr>`)
    h.push('</table>')
  }

  h.push(`<h2>Failures, exemptions and context gaps (${failures.length})</h2>`)
  for (const r of failures) {
    const title = `${r.edge ? `<b>${esc(r.edge)}</b> ` : ''}${esc(r.key)} ${esc(r.instance)} @${r.viewport} ${esc(r.state)} (${esc(CMP[r.comparison])})`
    h.push(`<details ${r.status === 'fail' ? 'open' : ''}><summary class="${status(r)}">${status(r)}: ${title}</summary><p>${esc(r.message ?? '')}</p>`)
    if (r.images) {
      h.push('<div class="imgs">' + (['expected', 'actual', 'diff'] as const).filter((k) => r.images![k]).map((k) => `<figure><figcaption>${k}</figcaption><img src="${esc(r.images![k])}"></figure>`).join('') + '</div>')
    }
    if (r.styleDiffs?.length) {
      h.push(`<p>${r.styleDiffCount} computed-style difference(s)${r.styleDiffCount! > r.styleDiffs.length ? `, first ${r.styleDiffs.length}` : ''}:</p><table><tr><th>element</th><th>property</th><th>a</th><th>b</th></tr>`)
      for (const d of r.styleDiffs) h.push(`<tr><td><code>${esc(d.path)}</code></td><td>${esc(d.property)}</td><td>${esc(d.a)}</td><td>${esc(d.b)}</td></tr>`)
      h.push('</table>')
    }
    h.push('</details>')
  }
  const withStyle = s.results.filter((r) => r.status === 'pass' && r.styleDiffCount)
  if (withStyle.length) {
    h.push(`<h2>Computed-style differences without a pixel difference (${withStyle.length})</h2>`)
    for (const r of withStyle) {
      h.push(`<details><summary>${esc(r.key)} ${esc(r.instance)} @${r.viewport} ${esc(r.state)}: ${r.styleDiffCount} difference(s)</summary><table><tr><th>element</th><th>property</th><th>a</th><th>b</th></tr>`)
      for (const d of r.styleDiffs!) h.push(`<tr><td><code>${esc(d.path)}</code></td><td>${esc(d.property)}</td><td>${esc(d.a)}</td><td>${esc(d.b)}</td></tr>`)
      h.push('</table></details>')
    }
  }
  writeFileSync(join(dir, 'index.html'), h.join('\n') + '\n')
}
