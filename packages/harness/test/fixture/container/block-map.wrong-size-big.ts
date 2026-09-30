// Adapter that makes every placeholder 30 px too short.
import full from './block-map.ts'
const shrink = (html: string) => html.replace(/height:([\d.]+)px/, (_m, h) => `height:${Math.max(Number(h) - 30, 0)}px`)
const wrap = (entry: any) => ({
  ...entry,
  slots: (fx: unknown, ctx: { foreign: { html: string }[] }) => entry.slots(fx, { ...ctx, foreign: ctx.foreign.map((b) => ({ ...b, html: shrink(b.html) })) }),
})
export default { ...full, PanelBlock: wrap(full.PanelBlock), GridBlock: wrap(full.GridBlock) }
