# @motor-cms/ui-design-styles

## 0.1.0-rc.0

### Minor Changes

- 776eeea: Recipes: `tv` (tailwind-variants with tailwind-merge set up for the `tw:` prefix and the token scales, so a variant's colour replaces the base colour and a token font-size survives next to a colour), `twMergeConfig`, and `blockBase`, the shared page defaults every block recipe extends. Blocks are shipped as `.vue` source under `./frontend/*.vue` and `./builder/*.vue`; styles export `./*.css` from `src`.
- 776eeea: Add the `ParagraphAtom` block: a `paragraphAtom` recipe (rich-text element rules, list marker and parent-context variants), the frontend and builder Vue files, and the `rich-text.css` sheet for round check list markers. `html` is rendered as it is (`nofollow` words and empty `rel=""` removed, `<p>` + `text` when empty), `bullet_type` is `dot` or `check`, `orderedlist_type` sets `--ordered-list-style`.
