// Block map of the synthetic fixture: both blocks with a frontend and a builder implementation.
export default {
  DemoBlock: {
    frontend: () => import('./blocks/DemoBlock.vue'),
    builder: () => import('./blocks/DemoBlock.vue'),
    props: (fx: { node: { title: string; text: string } }) => ({ title: fx.node.title, text: fx.node.text }),
  },
  PlainBlock: {
    frontend: () => import('./blocks/PlainBlock.vue'),
    builder: () => import('./blocks/PlainBlock.vue'),
    props: (fx: { node: { text: string } }) => ({ text: fx.node.text }),
  },
}
