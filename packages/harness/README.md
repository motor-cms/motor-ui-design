# @motor-cms/ui-design-harness

Parity engine: renders captured legacy HTML + CSS and new Vue blocks side by side in Chromium and compares them
(pixels plus computed styles). It knows nothing about specific blocks or clients; the consumer supplies a reference
pack, a config and a block map.

```
motor-ui-parity --config <file> [--reference <dir>] [--blocks A,B] [--theme <name>] [--mode validate|gate]
                [--viewports 375,1440] [--report <dir>] [--scrollbar <px>] [--legacy-css-on-new] [--concurrency <n>] [--no-edge-report]
```

- `gate` (default, CI-capable): `/frontend` against `/legacy`, live in the same run; `/builder` against `/frontend` with
  `exemptions.json` (`{ "<Key>": { "viewports"?: number[], "reason": string } }`, builder vs frontend only). A key without
  a `frontend` or `builder` entry in the block map is reported missing and the run exits 1.
- `validate` (local): the legacy render against the reference PNGs of the pack. Plain pixel comparison, no inference of
  anything the excerpt lacks. An instance whose reference shows page context the excerpt does not contain (an ancestor
  gradient behind a translucent element, floating page chrome) fails here; list it in the validate-only file
  `validateContextGaps` (config; `{ "<Key>/<instance>": { "reason": string, "viewports"?: number[] } }`). Those results are
  reported as `context gap` with the reason, counted separately, never as a pass; entries that no failure matches are
  reported as stale. The gate never reads this file.
- **Tolerance chain (M2).** `frontend-vs-legacy` is the contract. `builder-vs-frontend` compares the builder against the
  *frontend* render, not against the legacy one: each comparison allows `maxDiffPixelRatio` (0.1 %), so the builder can
  drift from the legacy by about twice that. That is deliberate (the builder's contract is "looks like the frontend");
  tighten it only together with the frontend's own tolerance.
- **A run that is not the full contract run says so.** Any narrowing or alteration (`--viewports` or a config `viewports`
  list that is not the contract's 19, `--blocks`, `--legacy-css-on-new`, `--theme` different from the config, `--scrollbar`
  other than 0, `--reference`, states skipped because the reference did not capture them) is listed in `summary.json`
  (`partial`), on the verdict line (`gate: PARTIAL OK` / `FAILED (partial run)`) and in the report. `gate: OK` is only
  printed for a complete run. A run with zero comparisons fails.
- Exit codes: 0 all good, 1 differences or missing implementations, 2 harness error (font not loaded, asset missing, ...).
- Report: `<report>/index.html` (diff images, style diffs, breakpoint-edge table) and `<report>/summary.json`. The report
  directory is wiped before a run, so the harness refuses one that is or contains the working directory, the config, the
  reference pack or a file the run reads, and one that is not empty and holds no `summary.json`.
- Edge report (informational, `gate` only, off with `--no-edge-report`): the verdict pass runs with `--scrollbar 0`, where a
  container query and a viewport media query see the same width. A second pass at a 15 px scrollbar over the viewports at
  the breakpoint edges reports each edge at both sides (`summary.json` `edgeReport`, a table in the report, a block on the
  console). It never changes the verdict.
- `--scrollbar <px>` narrows the page container by that many px, as a classic scrollbar does: viewport media queries
  (legacy) then switch earlier than container queries (new). A mismatch on one side of a breakpoint pair is reported as
  `edge <a>/<b>`.

## Config (`parity.config.mjs`)

```js
import { defineConfig } from '@motor-cms/ui-design-harness'
export default defineConfig({
  reference: 'reference',            // pack directory
  blockMap: 'parity/block-map.ts',   // default export: BlockMap, loaded through Vite
  css: ['dist/theme.css'],           // new implementation's CSS, /frontend and /builder only
  theme: 'default',                  // data-theme on the root
  exemptions: 'exemptions.json',
  fonts: [],                         // families that must be declared and load in every render
  validateContextGaps: 'validate-context-gaps.json', // validate only, optional
  fsAllow: [],                       // extra directories the dev server may serve (blocks outside the block map's directory)
})
```

## Block map

```ts
export default {
  MyBlock: {
    frontend: () => import('./MyBlock.vue'),   // default export = component
    builder: () => import('./MyBlockBuilder.vue'),
    props: (fixture, ctx) => ({ ... }),         // fixture = fixture.json of the instance
    slots: (fixture, ctx) => ({ default: '<b>html</b>' }), // optional
  },
}
```

The whole block is compared: one root element is screenshotted as the capture does; when a block renders several root
nodes (a fragment, an extra sibling) the union box of all of them is screenshotted and every root is style-diffed, so a
sibling the legacy markup lacks fails the size comparison.

`ctx.legacyHtml` is empty unless the run uses `--legacy-css-on-new` (identity fixtures): an adapter must map the fixture to
props itself, because that mapping is what the app will use.

## Reference pack layout it reads

`<ref>/<Key>/<instance>/{fixture.json (host, states), capture.json (states[state][viewport] = {status, width}),
outer.html, outer-<vp>.html, <vp>[-<state>].png}`, `<ref>/frontend[.<host>].css`, `<ref>/_images/`, `<ref>/_assets/`
(files for absolute asset URLs in the captured CSS: origins ending in `.test` are answered from it).

## Dev server

The Vite dev server listens on 127.0.0.1 with a random port for the length of a run and serves an explicit allow-list only:
the reference pack, the harness, the directories of the block map and of the configured CSS, the pnpm stores of the harness
and the working directory, and `fsAllow`. A block imported from another checkout needs that checkout in `fsAllow`.

## Waiting

A render waits for fonts, `<img>` elements and every CSS background image (also on pseudo-elements, also the ones a hover or
focus state switches on) to load, then two animation frames. There are no fixed sleeps.
