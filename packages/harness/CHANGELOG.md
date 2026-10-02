# @motor-cms/ui-design-harness

## 0.1.0-rc.0

### Minor Changes

- 776eeea: Container mode: a block configured under `containers` has its foreign children (chosen by the consumer) measured in the legacy render and replaced by neutral placeholder boxes of the same size; the adapter gets the same boxes as `ctx.foreign`. The container's own markup and its pilot children are compared normally, and a missing, resized or moved (more than 0.5 px from its legacy offset) placeholder fails the check.
- 776eeea: Container mode carries a foreign child's transforms (and, when transformed, its transform origin) onto the placeholder, so a translated child is compared where it is drawn. A state is skipped as declared (`declared: true`, shown on the verdict line, no longer makes a full run partial) only where the reference records the default state at that viewport as `clipped` and the state's own capture is missing or `clipped`; any other status still keeps the run partial. An instance with no captured state at any viewport of the run fails the run (`uncompared` in the summary, `NO COMPARABLE STATE` on the console), declared or not.
