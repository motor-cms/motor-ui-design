---
'@motor-cms/ui-design-harness': minor
---

Container mode carries a foreign child's transforms (and, when transformed, its transform origin) onto the placeholder, so a translated child is compared where it is drawn. States at a viewport where the reference records the block as `clipped` are skipped as declared (`declared: true`, shown on the verdict line) and no longer make a full run partial; any other missing capture still does.
