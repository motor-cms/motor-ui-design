---
'@motor-cms/ui-design-recipes': minor
'@motor-cms/ui-design-blocks': minor
---

Add the `ButtonAtom` block: a `buttonAtom` recipe (slots for the link, inner row, label and arrow icon; looks dark, light, primary, blur, ghost, inactive, disabled, link, small, checkout and checkout-next-step; parent-context variants) and the frontend and builder Vue files. The link is an `<a>` with an `href` prop; the builder file does not follow it on click. The `disabled` look renders without `href` and `rel`, with `aria-disabled="true"` and `tabindex="-1"`, so it is neither focusable nor a link.
