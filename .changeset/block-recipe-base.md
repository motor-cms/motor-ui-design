---
'@motor-cms/ui-design-recipes': minor
'@motor-cms/ui-design-blocks': minor
'@motor-cms/ui-design-styles': minor
---

Recipes: `tv` (tailwind-variants with tailwind-merge set up for the `tw:` prefix and the token scales, so a variant's colour replaces the base colour and a token font-size survives next to a colour), `twMergeConfig`, and `blockBase`, the shared page defaults every block recipe extends. Blocks are shipped as `.vue` source under `./frontend/*.vue` and `./builder/*.vue`; styles export `./*.css` from `src`.
