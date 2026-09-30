// Adapter that shrinks every placeholder by one pixel: a difference the pixel tolerance alone would let through.
import full from './block-map.ts'
const shrink = (html: string) => html.replace(/height:([\d.]+)px/, (_m, h) => `height:${Number(h) - 1}px`)
const wrap = (entry: any) => ({
  ...entry,
  slots: (fx: unknown, ctx: { foreign: { html: string }[] }) => entry.slots(fx, { ...ctx, foreign: ctx.foreign.map((b) => ({ ...b, html: shrink(b.html) })) }),
})
export default { ...full, PanelBlock: wrap(full.PanelBlock), GridBlock: wrap(full.GridBlock) }
