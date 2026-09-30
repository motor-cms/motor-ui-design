---
'@motor-cms/ui-design-harness': minor
---

Container mode: a block configured under `containers` has its foreign children (chosen by the consumer) measured in the legacy render and replaced by neutral placeholder boxes of the same size; the adapter gets the same boxes as `ctx.foreign`. The container's own markup and its pilot children are compared normally, and a missing or resized placeholder fails the check.
