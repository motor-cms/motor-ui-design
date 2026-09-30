import { tv } from './tv.js'
import { blockBase } from './base.js'

// Card: an image area on top and a body that overlaps the lower edge of the image. Slots: `base` the card, `image` the
// area for the image atom, `body` the translucent, blurred panel with rounded bottom corners that holds the other atoms.
//   empty   the image slot holds nothing: the area keeps a strip of its own so that the body still overlaps something
// `blockBase` is listed, not extended: an extended base would not reach the `base` slot of a recipe with slots.
export const cardComponent = tv({
  slots: {
    base: [blockBase(), 'tw:block'],
    image: 'tw:relative',
    body: 'tw:relative tw:box-border tw:-mt-8 tw:p-6 tw:overflow-hidden tw:rounded-b-sm tw:bg-light-100-60 tw:backdrop-blur-md',
  },
  variants: {
    empty: {
      true: { image: 'tw:h-9' },
      false: '',
    },
  },
  defaultVariants: { empty: false },
})
