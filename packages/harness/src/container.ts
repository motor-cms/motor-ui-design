import type { ContainerSpec, ForeignBox, ForeignSelector } from './types.js'

// Container mode: placeholder markup and selector resolution. Pure: shared by the runner and by in-page code.

/** Flat neutral fill of a placeholder (legacy and new render use the same markup, so the colour never differs). */
export const PLACEHOLDER_FILL = '#c8c8c8'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * The placeholder of a foreign child: one element with the border-box size and the margins of the original, and the
 * layout-relevant properties that decide how it takes part in its parent (position, float, flex/grid item properties, transforms).
 * It is taken out of any flex shrinking and stretching.
 */
export const placeholderHtml = (b: Pick<ForeignBox, 'id' | 'index' | 'width' | 'height' | 'margin' | 'layout'>): string => {
  const style = [
    'box-sizing:border-box',
    `width:${b.width}px`,
    `height:${b.height}px`,
    `margin:${b.margin}`,
    'padding:0',
    'border:0',
    'min-width:0',
    'min-height:0',
    'max-width:none',
    'max-height:none',
    'flex:none',
    `background:${PLACEHOLDER_FILL}`,
    ...Object.entries(b.layout).map(([k, v]) => `${k}:${v}`),
  ].join(';')
  return `<div data-parity-foreign="${b.index}" data-parity-foreign-id="${esc(b.id)}" style="${esc(style)}"></div>`
}

export const resolveForeign = (
  spec: ContainerSpec,
  fixture: unknown,
  ctx: { key: string; instance: string; viewport: number; implemented: string[] },
): ForeignSelector[] => {
  const raw = typeof spec.foreign === 'function' ? spec.foreign(fixture, ctx) : spec.foreign
  if (!Array.isArray(raw)) throw new Error(`container mode for ${ctx.key}: "foreign" must be a list of selectors or return one`)
  return raw.map((e) => {
    const sel = typeof e === 'string' ? { id: e, selector: e } : e
    if (!sel || typeof sel.id !== 'string' || typeof sel.selector !== 'string' || !sel.selector.trim()) {
      throw new Error(`container mode for ${ctx.key}/${ctx.instance}: every foreign entry is a selector string or { id, selector }, got ${JSON.stringify(e)}`)
    }
    return sel
  })
}
