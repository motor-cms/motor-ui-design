---
'@motor-cms/ui-design-harness': minor
---

Container mode carries a foreign child's transforms (and, when transformed, its transform origin) onto the placeholder, so a translated child is compared where it is drawn. A state is skipped as declared (`declared: true`, shown on the verdict line, no longer makes a full run partial) only where the reference records the default state at that viewport as `clipped` and the state's own capture is missing or `clipped`; any other status still keeps the run partial. An instance with no captured state at any viewport of the run fails the run (`uncompared` in the summary, `NO COMPARABLE STATE` on the console), declared or not.
