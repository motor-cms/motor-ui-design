// Adapter that moves the placeholder 1 px to the right without changing its size.
import full from './block-map.ts'
const shift = (html: string) => html.replace(/"><\/div>$/, ';position:relative;left:1px"></div>')
const entry = full.BadgeBlock
export default { ...full, BadgeBlock: { ...entry, slots: (fx: unknown, ctx: { foreign: { id: string; html: string }[] }) => entry.slots(fx, { ...ctx, foreign: ctx.foreign.map((b) => ({ ...b, html: shift(b.html) })) }) } }
