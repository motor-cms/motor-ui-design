import { tv } from './tv.js'
import { blockBase } from './base.js'

// Row with columns: a centred container (capped width, side padding), a flex row whose negative margins pull the columns'
// half gutters back out, and columns that are full width and take their span (of 12) from the `lg` container width on.
// Gutters are 16px across and 8px between stacked columns. Slots: `base` the container, `row`, `column`.
//   span   a column's width in twelfths from the `lg` container width on (narrower: full width); 12 is the default
// What goes inside a column (the components and the gap below each) is the content's business, not the row's.
// `blockBase` is listed, not extended: an extended base would not reach the `base` slot of a recipe with slots.
export const rowGrid = tv({
  slots: {
    base: [blockBase(), 'tw:block tw:w-full tw:max-w-420 tw:mx-auto tw:px-4'],
    row: 'tw:flex tw:flex-wrap tw:-mx-2 tw:-mt-2',
    column: 'tw:box-border tw:w-full tw:max-w-full tw:shrink-0 tw:mt-2 tw:px-2',
  },
  variants: {
    span: {
      1: { column: 'tw:@lg/page:w-1/12' },
      2: { column: 'tw:@lg/page:w-2/12' },
      3: { column: 'tw:@lg/page:w-3/12' },
      4: { column: 'tw:@lg/page:w-4/12' },
      5: { column: 'tw:@lg/page:w-5/12' },
      6: { column: 'tw:@lg/page:w-6/12' },
      7: { column: 'tw:@lg/page:w-7/12' },
      8: { column: 'tw:@lg/page:w-8/12' },
      9: { column: 'tw:@lg/page:w-9/12' },
      10: { column: 'tw:@lg/page:w-10/12' },
      11: { column: 'tw:@lg/page:w-11/12' },
      12: { column: 'tw:@lg/page:w-12/12' },
    },
  },
  defaultVariants: { span: 12 },
})
