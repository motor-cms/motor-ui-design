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
- **Declared clipping is not a narrowing.** Where the reference records the default state at a viewport as `clipped`
  (the page clips the block there, e.g. outside a carousel track), every state of that instance at that viewport is
  skipped as outside the contract: counted under `skipped` (`declared: true`), shown as `declared clipped` on the verdict
  line, and not listed in `partial`. Any other missing capture keeps the run partial.
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

## Container mode (blocks whose children are other blocks)

A container block (a row with columns, a card with slots) holds other blocks. The legacy render contains their markup and CSS;
the new render only gets slot HTML strings built by the adapter, without legacy CSS. Content that has no implementation yet can
never match, and its mismatch would hide whether the container itself is right. Container mode compares what the container is
responsible for (grid, columns, gutters, offsets, spacing, frame, padding, slot positions) exactly, with the foreign content
reduced to neutral boxes. It is gate only, per block key, and never applies to a block that is not configured.

```js
export default defineConfig({
  containers: {
    // a list of selectors, or a function of the instance's fixture returning one
    MyRow: { foreign: (fixture, { key, instance, viewport, implemented }) => /* [{ id, selector }, ...] */ [] },
    MyCard: { foreign: ['.card__media > *', { id: 'badge', selector: '.card__badge' }] },
  },
})
```

- **Which children are foreign is the consumer's decision.** `foreign` returns CSS selectors (a bare string is its own id;
  `{ id, selector }` names it). They are matched below the block root in the legacy markup and may start at the root's own
  classes. A function gets the instance's `fixture` and `implemented`, the block map keys that have a frontend, so "every
  child block that is not in the block map" is a filter over the fixture's definition tree. The harness knows no block names.
  Pilot children are not listed: they are rendered and compared like the rest.
- **Legacy render.** After fonts and images have loaded, each matched element's border box is measured, then the element is
  replaced by a placeholder: one empty `div` with that width and height (fractional px kept), the computed margins, flat neutral
  fill, `flex: none`, and the properties that decide how it takes part in its parent (display mapped to block or inline-block,
  position and insets, float, clear, vertical-align, align-self, justify-self, order, grid placement, transform, translate,
  rotate, scale and, when transformed, transform-origin; the measured box includes transforms). The surrounding layout does
  not change. Nested matches: the outermost element wins. A selector that matches nothing, is invalid, matches the block root or
  a `display: contents` element is a harness error (exit 2), not a silent pass.
- **Adapter contract.** `ctx.foreign` (in `props` and `slots`) lists the measured boxes in document order:
  `{ id, index, selector, x, y, width, height, margin, layout, html }` (`x`, `y` = offset from the container root's border box). `html` is the placeholder markup, identical to the legacy
  one. Put it where the foreign child sits, unchanged: `slots: (fx, ctx) => ({ body: ctx.foreign.filter((b) => b.id === 'x').map((b) => b.html).join('') + ... })`.
  `ctx.foreign` is `[]` for a block that is not a configured container.
- **What is compared.** Everything else as before: pixels and size at the usual tolerances (0.1 % of the pixels, size exactly)
  of the whole block, placeholders included, so a container that mispositions a pilot child, changes a gutter or a column
  width, or pads differently fails. On top of that the new render is checked for every placeholder: it must be present exactly
  once (`data-parity-foreign`), have the measured size (0.05 px) and sit at the measured offset from the container root's
  border box (0.5 px, per viewport and state). A missing, duplicated, resized or moved placeholder fails the check with
  `container mode: placeholder <n> (<id>) ...`, naming both sizes or both offsets, even where the pixels stay under the tolerance.
- **What is not compared.** The inside of a foreign child (its markup, text, images, CSS) and its absolutely positioned or
  overflowing descendants. Its size and margins are taken from the legacy render, so a container cannot be wrong about them.
- **Report.** Every `frontend-vs-legacy` and `builder-vs-frontend` result of a container instance carries
  `container.replaced` (`id`, `index`, `selector`, `width`, `height`, `margin`) in `summary.json`, and `index.html` has a
  "Container mode" table per instance and viewport.
- **Not active** in `validate` mode (the legacy render must stay the captured one) and with `--legacy-css-on-new` (the new
  side gets the legacy markup). The config keys must exist in the reference pack.

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
