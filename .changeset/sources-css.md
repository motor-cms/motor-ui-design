---
'@motor-cms/ui-design-recipes': minor
'@motor-cms/ui-design-blocks': minor
---

Ship `sources.css` in `@motor-cms/ui-design-blocks` and `@motor-cms/ui-design-recipes`. An app imports `@motor-cms/ui-design-blocks/sources.css` and Tailwind then finds the `tw:` classes of the block files and of the recipes (the blocks file imports the recipes one). No `@source` path into this package belongs in an app stylesheet any more, whether the package comes from the registry or from a local link.
