import { createTV } from 'tailwind-variants'

// tailwind-merge resolves conflicting utilities (a variant's colour over the base colour) but only knows Tailwind's own
// scales: it reads the custom font-size `tw:text-h2` as a colour and drops it next to a colour. The token names that
// theme.css adds to Tailwind's theme are registered here. They are listed, not imported: this module runs in the browser
// and the token package's entry point pulls in Node modules. `test/merge.test.ts` fails when the lists and the token
// schema (`base`) drift apart.
//
// Radius keys are sm/md/lg: the former s and l were also Tailwind's side utilities (`tw:rounded-s` compiled to the token
// radius plus the start corner rules).
// Colours need nothing: any `tw:text-<name>` that is not a registered font-size is a colour.
export const twMergeConfig = {
  prefix: 'tw',
  extend: {
    theme: {
      // the fluid font-size `text-<role>` (with its own line height), from text.<role>-min / -max
      text: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'overline', 'p'],
      'font-weight': ['light', 'regular', 'medium', 'bold'],
      spacing: ['section-0', 'section-xs', 'section-s', 'section-m', 'section-l', 'section-xl'],
      radius: ['sm', 'md', 'lg'],
      shadow: ['base', 'small'],
      ease: ['base'],
    },
  },
}

/** `tv` for every recipe: tailwind-variants with tailwind-merge set up for the `tw:` prefix and the token scales. */
export const tv = createTV({ twMerge: true, twMergeConfig })
