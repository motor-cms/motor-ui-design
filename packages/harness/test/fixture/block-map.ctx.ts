// An adapter that (wrongly) reads the legacy markup: it must get nothing outside identity mode.
import full from './block-map.ts'
export default {
  ...full,
  PlainBlock: { ...full.PlainBlock, props: (fx: { node: { text: string } }, ctx: { legacyHtml: string }) => ({ text: ctx.legacyHtml ? 'LEAKED LEGACY MARKUP' : fx.node.text }) },
}
