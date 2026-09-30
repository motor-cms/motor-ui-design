// Public types of the parity harness: the consumer config, the block map and the run results.

/** What an adapter gets besides the fixture (the fixture.json of the reference instance). */
export interface PropsContext {
  key: string
  instance: string
  viewport: number
  /** Markup of the legacy render for this instance and viewport. Only set in identity/test mode (--legacy-css-on-new), else ''. */
  legacyHtml: string
  /**
   * Container mode (see ParityConfig.containers): the foreign children measured in the legacy render of this instance and
   * viewport, in document order, each with the markup of its neutral placeholder (`html`). Empty for a block that is not a
   * configured container, and in identity mode.
   */
  foreign: ForeignBox[]
}

/** A container's foreign child, selected by the consumer. A bare string is both the selector and the id. */
export interface ForeignSelector {
  /** Name the adapter finds the box by (`ctx.foreign.filter((b) => b.id === ...)`). */
  id: string
  /** CSS selector, matched below the block's root in the legacy markup (it may start at the root). */
  selector: string
}

/** A foreign child as measured in the legacy render. */
export interface ForeignBox {
  id: string
  /** Position among the instance's foreign children in document order. */
  index: number
  selector: string
  /** Border box, px. */
  width: number
  height: number
  /** Computed margin, css shorthand (top right bottom left). */
  margin: string
  /** Layout-relevant computed properties carried over to the placeholder (display, position, float, grid placement, ...). */
  layout: Record<string, string>
  /** The placeholder element: put this, unchanged, where the foreign child sits. */
  html: string
}

/** What a container instance reports: the children that were replaced (html and layout left out). */
export interface ContainerInfo {
  replaced: Pick<ForeignBox, 'id' | 'index' | 'selector' | 'width' | 'height' | 'margin'>[]
}

export interface ContainerSpec {
  /**
   * The foreign children of this container: the children that are not pilot content (no implementation to compare).
   * A list of selectors, or a function of the instance's fixture returning one (`implemented` = the block map's keys
   * with a frontend implementation), for example "every child block whose key is not in the block map".
   */
  foreign: (string | ForeignSelector)[] | ((fixture: any, ctx: { key: string; instance: string; viewport: number; implemented: string[] }) => (string | ForeignSelector)[])
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
  /**
   * Container mode, gate only: block key -> which of its children are foreign. In the legacy render those children are
   * measured and replaced by neutral placeholder boxes of exactly their size (margins kept); the new render receives the
   * same boxes in `ctx.foreign`. Everything else, the container's own markup and its pilot children, is compared normally.
   * Applies to the listed keys only.
   */
  containers?: Record<string, ContainerSpec>
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
  /** Container mode: the legacy children that were replaced by placeholders for this instance and viewport. */
  container?: ContainerInfo
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
