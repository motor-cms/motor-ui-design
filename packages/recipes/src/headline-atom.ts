import { tv } from './tv.js'
import { blockBase } from './base.js'

// Headline: the level picks the fluid type scale (size and line height come with `tw:text-<level>`), the weight is one of
// the four token weights. `context` is where the atom sits on a page; a parent component restyles it in one of these ways.
//   flush         no gap below (the atom is the last thing in a tight parent)
//   flush-pointer no gap below and a pointer cursor (the atom is a disclosure trigger)
//   centered      centred text
//   centered-vp   centred text from the `vp` container width on (narrower: start-aligned)
//   left          left-aligned text
//   hyphenated    automatic hyphenation
export const headlineAtom = tv({
  extend: blockBase,
  base: 'tw:relative tw:m-0 tw:mb-4 tw:p-0 tw:tracking-normal',
  variants: {
    level: {
      h1: 'tw:text-h1',
      h2: 'tw:text-h2',
      h3: 'tw:text-h3',
      h4: 'tw:text-h4',
      h5: 'tw:text-h5',
      h6: 'tw:text-h6',
      'h6-grey': 'tw:text-h6 tw:text-dark-95',
    },
    weight: {
      light: 'tw:font-light',
      regular: 'tw:font-regular',
      medium: 'tw:font-medium',
      bold: 'tw:font-bold',
    },
    context: {
      none: '',
      flush: 'tw:mb-0',
      'flush-pointer': 'tw:mb-0 tw:cursor-pointer',
      centered: 'tw:text-center',
      'centered-vp': 'tw:@vp/page:text-center',
      left: 'tw:text-left',
      hyphenated: 'tw:hyphens-auto',
    },
  },
  defaultVariants: { level: 'h2', weight: 'regular', context: 'none' },
})

export type HeadlineContext = Exclude<keyof typeof headlineAtom.variants.context, 'none'>
