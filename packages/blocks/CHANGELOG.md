# @motor-cms/ui-design-blocks

## 0.1.0-rc.0

### Minor Changes

- 776eeea: Recipes: `tv` (tailwind-variants with tailwind-merge set up for the `tw:` prefix and the token scales, so a variant's colour replaces the base colour and a token font-size survives next to a colour), `twMergeConfig`, and `blockBase`, the shared page defaults every block recipe extends. Blocks are shipped as `.vue` source under `./frontend/*.vue` and `./builder/*.vue`; styles export `./*.css` from `src`.
- 776eeea: Add the `ButtonAtom` block: a `buttonAtom` recipe (slots for the link, inner row, label and arrow icon; looks dark, light, primary, blur, ghost, inactive, disabled, link, small, checkout and checkout-next-step; parent-context variants) and the frontend and builder Vue files. The link is an `<a>` with an `href` prop; the builder file does not follow it on click. The `disabled` look renders without `href` and `rel`, with `aria-disabled="true"` and `tabindex="-1"`, so it is neither focusable nor a link.
- 776eeea: Add the `CardComponent` block: a `cardComponent` recipe (card, image area and a translucent, blurred body panel that overlaps the image, with rounded bottom corners) and the frontend and builder Vue files with the slots `image` and `body`.
- 776eeea: Add the `HeadlineAtom` block: a `headlineAtom` recipe (level, weight and parent-context variants) and the frontend and builder Vue files. `weight` takes light, regular, medium or bold; `context` names how a parent component restyles the headline (flush, flush-pointer, centered, centered-vp, left, hyphenated).
- 776eeea: Add the `ParagraphAtom` block: a `paragraphAtom` recipe (rich-text element rules, list marker and parent-context variants), the frontend and builder Vue files, and the `rich-text.css` sheet for round check list markers. `html` is rendered as it is (`nofollow` words and empty `rel=""` removed, `<p>` + `text` when empty), `bullet_type` is `dot` or `check`, `orderedlist_type` sets `--ordered-list-style`.
- 776eeea: Add the `RowGrid` block: a `rowGrid` recipe (a centred, capped container, a flex row with half-gutter margins, columns that take their span of 12 from the `lg` container width on) and the frontend and builder Vue files. The columns are a `columns` prop (`span`, `classes`) and the slots `column-<i>`.
- 0193ef7: Ship `sources.css` in `@motor-cms/ui-design-blocks` and `@motor-cms/ui-design-recipes`. An app imports `@motor-cms/ui-design-blocks/sources.css` and Tailwind then finds the `tw:` classes of the block files and of the recipes (the blocks file imports the recipes one). No `@source` path into this package belongs in an app stylesheet any more, whether the package comes from the registry or from a local link.

### Patch Changes

- Updated dependencies [776eeea]
- Updated dependencies [776eeea]
- Updated dependencies [776eeea]
- Updated dependencies [776eeea]
- Updated dependencies [776eeea]
- Updated dependencies [776eeea]
- Updated dependencies [776eeea]
- Updated dependencies [0193ef7]
  - @motor-cms/ui-design-recipes@0.1.0-rc.0
