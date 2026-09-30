# @motor-cms/ui-design-harness

Parity engine: renders captured legacy HTML + CSS and new Vue blocks side by side in Chromium and compares them
(pixels plus computed styles). It knows nothing about specific blocks or clients; the consumer supplies a reference
pack, a config and a block map.

```
motor-ui-parity --config <file> [--reference <dir>] [--blocks A,B] [--theme <name>] [--mode validate|gate]
                [--viewports 375,1440] [--report <dir>] [--scrollbar <px>] [--legacy-css-on-new] [--concurrency <n>]
```

- `gate` (default, CI-capable): `/frontend` against `/legacy`, live in the same run; `/builder` against `/frontend` with
  `exemptions.json` (`{ "<Key>": { "viewports"?: number[], "reason": string } }`, builder vs frontend only). A key without
  a `frontend` or `builder` entry in the block map is reported missing and the run exits 1.
- `validate` (local): the legacy render against the reference PNGs of the pack.
- Exit codes: 0 all good, 1 differences or missing implementations, 2 harness error (font not loaded, asset missing, ...).
- Report: `<report>/index.html` (diff images, style diffs, breakpoint-edge table) and `<report>/summary.json`.
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

A block renders exactly one root element; that element is what is screenshotted and style-diffed.

## Reference pack layout it reads

`<ref>/<Key>/<instance>/{fixture.json (host, states), capture.json (states[state][viewport] = {status, width}),
outer.html, outer-<vp>.html, <vp>[-<state>].png}`, `<ref>/frontend[.<host>].css`, `<ref>/_images/`, `<ref>/_assets/`
(files for absolute asset URLs in the captured CSS: origins ending in `.test` are answered from it).
