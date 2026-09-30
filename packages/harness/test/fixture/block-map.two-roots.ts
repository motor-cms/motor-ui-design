// PlainBlock as a block with two roots (the test gives the legacy markup the same two roots).
import full from './block-map.ts'
export default {
  ...full,
  PlainBlock: { ...full.PlainBlock, frontend: () => import('./blocks/TwoRoots.vue'), builder: () => import('./blocks/TwoRoots.vue') },
}
