// The builder implementation of DemoBlock differs from its frontend by one pixel of padding.
import full from './block-map.ts'
export default {
  ...full,
  DemoBlock: { ...full.DemoBlock, builder: () => import('./blocks/DemoBlockBuilder.vue') },
}
