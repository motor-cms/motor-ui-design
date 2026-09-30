import { tv } from './tv.js'
import { blockBase } from './base.js'

// Link styled as a button: a pill with a label and an optional arrow. Slots: `base` the link, `inner` the padded row,
// `label`, `icon` (the arrow's box; the arrow takes the icon's colour). On hover, focus and press the colours swap; the
// label and the icon carry their own colour so that it transitions.
//   variant   the look. dark, light, primary, blur, ghost, inactive, disabled set colours; link is an underlined text
//             link; small and checkout are size variants; checkout-next-step widens the checkout button
//   context   where the atom sits on a page; a parent component restyles it in one of these ways
//             inline-centered centred text, and an inline box from the `vpl` container width on
//             hyphenated     automatic hyphenation
//             shifted        in normal flow, moved right and up (an overlay button on a teaser image)
//             static-left    in normal flow, left-aligned text (an overlay button on an image)
//             corner         in the bottom left corner of the nearest positioned ancestor (an image's button)
//             gap-below      a gap below
const swap = 'tw:group-hover/btn:text-dark-100 tw:group-focus/btn:text-dark-100 tw:group-active/btn:text-dark-100'

export const buttonAtom = tv({
  slots: {
    // `blockBase` is listed, not extended: an extended base would not reach the `base` slot of a recipe with slots
    base: [
      blockBase(),
      'tw:group/btn tw:block tw:w-fit tw:cursor-pointer tw:no-underline',
      'tw:mt-6 tw:p-0.5 tw:rounded-full tw:text-sm tw:leading-5',
      'tw:transition-colors tw:duration-350 tw:ease-in-out',
      'tw:hover:[-webkit-text-stroke:0.4px_currentcolor]',
      'tw:focus-visible:outline-2 tw:focus-visible:outline-solid tw:focus-visible:outline-current',
    ],
    inner: 'tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-full tw:px-6 tw:py-3.5',
    label: 'tw:font-medium tw:transition-colors tw:duration-350 tw:ease-in-out',
    icon: 'tw:flex tw:items-center tw:justify-center tw:ml-6 tw:transition-colors tw:duration-350 tw:ease-in-out',
  },
  variants: {
    variant: {
      dark: {
        base: 'tw:bg-dark-100 tw:text-light-100 tw:hover:bg-primary-100 tw:focus:bg-primary-100 tw:active:bg-primary-100',
        label: `tw:text-light-100 ${swap}`,
        icon: `tw:text-light-100 ${swap}`,
      },
      light: {
        base: 'tw:bg-light-100 tw:text-dark-100 tw:hover:bg-primary-100 tw:focus:bg-primary-100 tw:active:bg-primary-100',
        icon: 'tw:text-dark-100',
      },
      primary: {
        base: 'tw:bg-primary-100 tw:text-dark-100 tw:hover:bg-btn-primary-hover-bg tw:focus:bg-btn-primary-hover-bg tw:active:bg-btn-primary-hover-bg',
        label: 'tw:group-hover/btn:text-light-100 tw:group-focus/btn:text-light-100 tw:group-active/btn:text-light-100',
        icon: 'tw:text-dark-100 tw:group-hover/btn:text-light-100 tw:group-focus/btn:text-light-100 tw:group-active/btn:text-light-100',
      },
      blur: {
        base: 'tw:bg-light-100-60 tw:text-dark-100 tw:backdrop-blur-md tw:hover:bg-primary-100-alpha-60 tw:focus:bg-primary-100-alpha-60 tw:active:bg-primary-100-alpha-60',
        icon: 'tw:text-dark-100',
      },
      ghost: {
        base: 'tw:border-2 tw:border-solid tw:border-dark-100 tw:text-dark-100 tw:hover:border-primary-100 tw:focus:border-primary-100 tw:active:border-primary-100 tw:transition-[border-color]',
        inner: 'tw:bg-light-100',
        icon: 'tw:text-dark-100',
      },
      inactive: {
        base: 'tw:bg-dark-40 tw:text-light-100',
        icon: 'tw:text-light-100',
      },
      disabled: {
        base: 'tw:bg-dark-40 tw:text-light-100 tw:cursor-not-allowed tw:pointer-events-none',
        icon: 'tw:text-light-100',
      },
      link: {
        base: 'tw:m-0 tw:p-0 tw:rounded-none tw:bg-transparent tw:text-dark-95 tw:underline tw:hover:text-primary-100 tw:focus:text-primary-100 tw:focus:outline-2 tw:focus:outline-solid tw:focus:outline-primary-100',
      },
      small: { inner: 'tw:px-5 tw:py-0.5' },
      checkout: {
        base: 'tw:flex tw:items-center tw:justify-center tw:gap-4 tw:min-h-16 tw:py-4.5 tw:px-6.5 tw:rounded-sm',
        label: 'tw:text-lg tw:leading-5',
        icon: 'tw:m-0',
      },
      'checkout-next-step': { base: 'tw:min-w-75 tw:mt-4' },
    },
    context: {
      none: '',
      'inline-centered': { base: 'tw:text-center tw:@vpl/page:inline-block' },
      hyphenated: { base: 'tw:hyphens-auto' },
      shifted: { base: 'tw:static tw:translate-x-4 tw:-translate-y-23' },
      'static-left': { base: 'tw:static tw:text-left' },
      corner: { base: 'tw:absolute tw:bottom-4 tw:left-4' },
      'gap-below': { base: 'tw:mb-4' },
    },
  },
  defaultVariants: { variant: 'dark', context: 'none' },
})
