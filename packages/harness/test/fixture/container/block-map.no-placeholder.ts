// Adapter that ignores ctx.foreign and sizes the foreign area itself.
import full from './block-map.ts'
const own = (entry: any) => ({
  ...entry,
  slots: (fx: unknown, ctx: { foreign: unknown[] }) => entry.slots(fx, { ...ctx, foreign: [] }),
})
export default { ...full, PanelBlock: own(full.PanelBlock), GridBlock: own(full.GridBlock) }
