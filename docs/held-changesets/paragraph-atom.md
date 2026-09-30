---
'@motor-cms/ui-design-recipes': minor
'@motor-cms/ui-design-blocks': minor
'@motor-cms/ui-design-styles': minor
---

Add the `ParagraphAtom` block: a `paragraphAtom` recipe (rich-text element rules, list marker and parent-context variants), the frontend and builder Vue files, and the `rich-text.css` sheet for round check list markers. `html` is rendered as it is (`nofollow` words and empty `rel=""` removed, `<p>` + `text` when empty), `bullet_type` is `dot` or `check`, `orderedlist_type` sets `--ordered-list-style`.
