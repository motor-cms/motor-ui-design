# @motor-cms/ui-design-tokens

## 0.1.0-rc.0

### Minor Changes

- 776eeea: Radius tokens are named `sm`, `md`, `lg` (were `s`, `m`, `l`): `tw:rounded-s` and `tw:rounded-l` are Tailwind's start and left side utilities and compiled to the token radius plus a side rule. Themes that set `radius.s/m/l` must rename the keys. `twMergeConfig` registers the radius scale.
