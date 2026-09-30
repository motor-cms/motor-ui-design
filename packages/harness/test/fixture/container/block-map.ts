// Block map of the synthetic container fixture. The two containers take their foreign children as placeholders
// (ctx.foreign, measured in the legacy render) and their pilot child as a string built from the fixture.
const pilot = (cls: string, text: string) => `<div class="blk-pilot ${cls}">${text}</div>`
const placeholders = (ctx: { foreign: { id: string; html: string }[] }, id: string) =>
  ctx.foreign
    .filter((b) => b.id === id)
    .map((b) => b.html)
    .join('')

export default {
  PanelBlock: {
    frontend: () => import('./blocks/PanelBlock.vue'),
    builder: () => import('./blocks/PanelBlock.vue'),
    props: () => ({}),
    slots: (fx: { node: { children: { id: string; text?: string }[] } }, ctx: { foreign: { id: string; html: string }[] }) => ({
      media: placeholders(ctx, 'media'),
      body: placeholders(ctx, 'text') + pilot('blk-pilot--after', fx.node.children.find((c) => c.id === 'pilot')!.text!),
    }),
  },
  GridBlock: {
    frontend: () => import('./blocks/GridBlock.vue'),
    builder: () => import('./blocks/GridBlock.vue'),
    props: () => ({}),
    slots: (fx: { node: { children: { id: string; text?: string }[] } }, ctx: { foreign: { id: string; html: string }[] }) => ({
      a: placeholders(ctx, 'a'),
      b: pilot('', fx.node.children.find((c) => c.id === 'b')!.text!),
    }),
  },
  PlainBlock: {
    frontend: () => import('./blocks/PlainBlock.vue'),
    builder: () => import('./blocks/PlainBlock.vue'),
    props: (fx: { node: { text: string } }) => ({ text: fx.node.text }),
  },
}
