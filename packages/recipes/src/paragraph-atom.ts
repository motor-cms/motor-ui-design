import { tv } from './tv.js'
import { blockBase } from './base.js'

// Rich-text paragraph. The block root sets the paragraph type scale; the element rules below style what the editor stores
// inside it (paragraphs, headings, lists, links, emphasis). Element rules are arbitrary variants on the root, so nothing
// depends on a class name inside the stored html.
//   bullets   none: the browser's list markers; dot: a small round marker; check: a round check marker (needs the
//             `rich-text.css` sheet of the styles package, which reads `data-bullets="check"` on the root)
//   context   where the atom sits on a page; a parent component restyles it in one of these ways
//             hyphenated    automatic hyphenation
//             left          left-aligned text
//             muted-pointer softer text colour and a pointer cursor (legal text next to a checkbox)
//             soft          softer text colour
//             spaced        a gap above and below
//             padded-end    padding at the inline end from the `vpl` container width on
//             padded-start  padding at the inline start from the `vpl` container width on
export const paragraphAtom = tv({
  extend: blockBase,
  base: [
    'tw:text-p tw:tracking-normal',
    'tw:[&_p]:m-0 tw:[&_p]:mb-4 tw:[&_p:last-child]:mb-0',
    'tw:[&_h1]:m-0 tw:[&_h1]:p-0 tw:[&_h1]:text-h1 tw:[&_h1]:font-regular tw:[&_h1]:text-dark-100 tw:[&_h1]:tracking-normal',
    'tw:[&_h2]:m-0 tw:[&_h2]:p-0 tw:[&_h2]:text-h2 tw:[&_h2]:font-regular tw:[&_h2]:text-dark-100 tw:[&_h2]:tracking-normal',
    'tw:[&_h3]:m-0 tw:[&_h3]:p-0 tw:[&_h3]:text-h3 tw:[&_h3]:font-regular tw:[&_h3]:text-dark-100 tw:[&_h3]:tracking-normal',
    'tw:[&_h4]:m-0 tw:[&_h4]:p-0 tw:[&_h4]:text-h4 tw:[&_h4]:font-regular tw:[&_h4]:text-dark-100 tw:[&_h4]:tracking-normal',
    'tw:[&_h5]:m-0 tw:[&_h5]:p-0 tw:[&_h5]:text-h5 tw:[&_h5]:font-regular tw:[&_h5]:text-dark-100 tw:[&_h5]:tracking-normal',
    'tw:[&_h6]:m-0 tw:[&_h6]:p-0 tw:[&_h6]:text-h6 tw:[&_h6]:font-regular tw:[&_h6]:text-dark-100 tw:[&_h6]:tracking-normal',
    'tw:[&_b]:font-bold tw:[&_strong]:font-bold tw:[&_em]:italic tw:[&_i]:italic',
    'tw:[&_sup]:text-[0.75rem]',
    'tw:[&_ul]:m-0 tw:[&_ul]:pl-6 tw:[&_ol]:pl-6 tw:[&_ol]:[list-style:var(--ordered-list-style)]',
    // links: an inline flex box, dark, underlined; accent colour and a thin stroke on hover, an outline on keyboard focus
    'tw:[&_a]:inline-flex tw:[&_a]:items-center tw:[&_a]:justify-start tw:[&_a]:text-dark-100 tw:[&_a]:underline',
    'tw:[&_a]:transition-colors tw:[&_a]:duration-350 tw:[&_a]:ease-base',
    'tw:[&_a:hover]:text-primary-100 tw:[&_a:focus]:text-primary-100 tw:[&_a:active]:text-primary-100',
    'tw:[&_a:hover]:[-webkit-text-stroke:0.4px_currentcolor]',
    'tw:[&_a:focus-visible]:outline-2 tw:[&_a:focus-visible]:outline-solid tw:[&_a:focus-visible]:outline-current',
  ],
  variants: {
    bullets: {
      none: '',
      dot: [
        'tw:[&_ul]:list-none tw:[&_ul]:pl-0',
        'tw:[&_ul_li]:flex tw:[&_ul_li]:items-start tw:[&_ul_li]:justify-start tw:[&_ul_li]:gap-4 tw:[&_ul_li]:mb-4',
        'tw:[&_ul_li]:before:content-[\'\'] tw:[&_ul_li]:before:block tw:[&_ul_li]:before:shrink-0 tw:[&_ul_li]:before:grow-0 tw:[&_ul_li]:before:basis-1',
        'tw:[&_ul_li]:before:size-1 tw:[&_ul_li]:before:rounded-full tw:[&_ul_li]:before:bg-dark-100 tw:[&_ul_li]:before:translate-y-2.5',
      ],
      check: [
        'tw:[&_ul]:list-none tw:[&_ul]:pl-0',
        'tw:[&_ul_li]:flex tw:[&_ul_li]:items-start tw:[&_ul_li]:justify-start tw:[&_ul_li]:gap-4 tw:[&_ul_li]:mb-4',
      ],
    },
    context: {
      none: '',
      hyphenated: 'tw:hyphens-auto',
      left: 'tw:text-left',
      'muted-pointer': 'tw:text-dark-80 tw:cursor-pointer',
      soft: 'tw:text-dark-95',
      spaced: 'tw:my-4',
      'padded-end': 'tw:@vpl/page:pr-6',
      'padded-start': 'tw:@vpl/page:pl-6',
    },
  },
  defaultVariants: { bullets: 'none', context: 'none' },
})
