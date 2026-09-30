// Public types of the parity harness: the consumer config, the block map and the run results.

/** What an adapter gets besides the fixture (the fixture.json of the reference instance). */
export interface PropsContext {
  key: string
  instance: string
  viewport: number
  /** Markup of the legacy render for this instance and viewport. Only set in identity/test mode (--legacy-css-on-new), else ''. */
  legacyHtml: string
}

export interface BlockEntry {
  /** New frontend block (a Vue component module with a default export). */
  frontend?: () => Promise<{ default: unknown }>
  /** New builder block. */
  builder?: () => Promise<{ default: unknown }>
  /** Props for the component, derived from the reference fixture. */
  props: (fixture: any, ctx: PropsContext) => Record<string, unknown>
  /** Optional slot content as HTML strings, keyed by slot name. */
  slots?: (fixture: any, ctx: PropsContext) => Record<string, string>
}

export type BlockMap = Record<string, BlockEntry>

export interface ParityConfig {
  /** Reference pack directory. The CLI flag --reference wins. Relative paths resolve against the config file. */
  reference?: string
  /** Module whose default export is the BlockMap (loaded through Vite, so .ts and .vue imports work). */
  blockMap?: string
  /** CSS files of the new implementation (theme, Tailwind entry). Loaded on /frontend and /builder only. */
  css?: string[]
  /** data-theme applied on the root of /frontend and /builder. The CLI flag --theme wins. */
  theme?: string
  /** exemptions.json (builder vs frontend only). Default: <config dir>/exemptions.json when it exists. */
  exemptions?: string
  /** Legacy CSS file (relative to the reference dir) for a host label. Default: frontend.<host>.css, else frontend.css. */
  legacyCss?: (host: string, files: string[]) => string
  /** Font families that must be declared by an @font-face in every render and must load. Every declared face must load anyway. */
  fonts?: string[]
  /** Origin pattern of assets in captured CSS/HTML that are served from <reference>/_assets. Default: any host ending in .test. */
  assetOrigin?: RegExp
  /** Extra Vite plugins (for example the Tailwind plugin) for the consumer's block sources. */
  vitePlugins?: unknown[]
  /** Viewports and height. Defaults to the contract list, height 2800. */
  viewports?: number[]
  viewportHeight?: number
  reportDir?: string
  /**
   * validate only: file (relative to the config) listing instances whose reference screenshot contains page context the
   * excerpt lacks (ancestor backdrops, floating page chrome). Failures there are reported as "context gap" with the reason,
   * never as pass. The gate never reads this file.
   */
  validateContextGaps?: string
  /** Extra directories the dev server may serve (the block map's own directory and the harness are always allowed). */
  fsAllow?: string[]
}

export const defineConfig = (c: ParityConfig): ParityConfig => c

export type Exemptions = Record<string, { viewports?: number[]; reason: string }>
/** validate-context-gaps.json: "<Key>/<instance>" -> reason, optionally only for some viewports. */
export type ContextGaps = Record<string, { viewports?: number[]; reason: string }>

export type Mode = 'validate' | 'gate'
export type Comparison = 'reference-vs-legacy' | 'frontend-vs-legacy' | 'builder-vs-frontend'

export interface StyleDiff {
  path: string
  property: string
  a: string
  b: string
}

export interface CheckResult {
  comparison: Comparison
  key: string
  instance: string
  viewport: number
  state: string
  status: 'pass' | 'fail' | 'exempt' | 'context-gap'
  /** Human reason for a failure or an exemption. */
  message?: string
  diffPixels?: number
  totalPixels?: number
  ratio?: number
  sizeA?: [number, number]
  sizeB?: [number, number]
  /** "edge <a>/<b>" when the viewport is one side of a breakpoint edge. */
  edge?: string
  images?: { expected?: string; actual?: string; diff?: string }
  /** sub-pixel origin (x, y) of the element used for the render (validate: the fitted one) */
  origin?: [number, number]
  styleDiffs?: StyleDiff[]
  styleDiffCount?: number
}

export interface SkippedResult {
  key: string
  instance: string
  viewport: number
  state: string
  reason: string
}

export interface MissingResult {
  key: string
  what: 'frontend' | 'builder'
}

export interface RunSummary {
  mode: Mode
  reference: string
  theme: string
  startedAt: string
  seconds: number
  scrollbar: number
  tolerance: { threshold: number; maxDiffPixelRatio: number }
  totals: { checks: number; pass: number; fail: number; exempt: number; contextGap: number; skipped: number; missing: number }
  missing: MissingResult[]
  /** Why this run is not the full contract run (narrowed viewports/blocks, identity mode, skipped states, ...). Empty for a full run. */
  partial: string[]
  /** validate: context-gap entries that matched no failing check any more (stale entries) */
  unusedContextGaps: string[]
  /** Informational pass at another scrollbar width, per breakpoint edge. Never part of the verdict. */
  edgeReport?: EdgeReport
  results: CheckResult[]
  skipped: SkippedResult[]
  ok: boolean
}

export interface EdgeReport {
  scrollbar: number
  checks: number
  differ: number
  /** per block and comparison: each breakpoint edge at both sides */
  rows: { key: string; comparison: string; edge: string; a: string; b: string }[]
  /** the differing checks, same shape as results */
  results: CheckResult[]
}
