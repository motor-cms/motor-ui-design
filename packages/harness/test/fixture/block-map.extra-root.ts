// The frontend of DemoBlock emits an extra sibling root next to the demo block (the builder does not).
import full from './block-map.ts'
export default {
  ...full,
  DemoBlock: { ...full.DemoBlock, frontend: () => import('./blocks/ExtraRoot.vue') },
}
