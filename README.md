# motor-ui-design

Neutral, public design core for the motor-cms family: token schema and build, neutral base tokens,
recipes, generic styles, blocks and the parity harness engine. Client-specific layers live in their own
repos and depend on these packages.

| Package | Purpose |
|---|---|
| `@motor-cms/ui-design-tokens` | token schema, build tool, neutral base tokens |
| `@motor-cms/ui-design-recipes` | Tailwind recipes built on the tokens |
| `@motor-cms/ui-design-styles` | generic styles |
| `@motor-cms/ui-design-blocks` | Vue blocks (frontend and builder file per block) |
| `@motor-cms/ui-design-harness` | parity and drift runner (`pnpm parity --reference <dir>`) |

## Commands

```sh
pnpm install
pnpm build     # tsc per package
pnpm test      # build, then Vitest (smoke tests and the no-client-data guard)
pnpm parity    # stub until the harness lands; exits 1
```

Node 22, pnpm 12. Branches `develop`, `staging`, `production` publish `alpha`, `rc`, `latest` to npmjs
through the release workflows. A release needs an author-written changeset (`pnpm changeset`).
