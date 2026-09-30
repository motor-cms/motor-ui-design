import { tv } from './tv.js'

// The page-level defaults every block inherits from the page in a real app (for the legacy frontend: the global rules on
// `*`, `html` and `body`). Nothing reaches the harness render from a page, and there is no Preflight, so each block
// starts from this recipe (`extend: blockBase`) instead of restating the list. Per-element resets (heading margins,
// list padding) and a block's own type scale belong to that block's recipe, where it overrides these by merge.
//   box-sizing            border-box on every element
//   font                  the sans family at regular weight, colour dark-100
//   smoothing, rendering  antialiased, optimizeLegibility, font-synthesis none (a missing weight is never faked)
//   line-height, tracking 158 % and 0.5px: the page default that paragraph, button and overline text inherit; headings,
//                         paragraphs and the like reset tracking themselves (`tw:tracking-normal`)
// Two values have no token and are arbitrary on purpose (token request: body line height 158 %, body letter spacing 0.5px);
// `text-rendering` and `font-synthesis` have no Tailwind utility and are keywords, not design values.
export const blockBase = tv({
  base: [
    'tw:box-border tw:font-sans tw:font-regular tw:text-dark-100',
    'tw:antialiased tw:[text-rendering:optimizeLegibility] tw:[font-synthesis:none]',
    'tw:leading-[158%] tw:tracking-[0.5px]',
  ],
})
