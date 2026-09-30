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
pnpm test      # build, then Vitest (smoke tests, the structural no-client-data guard, the Tailwind 4 token test)
pnpm parity    # build, then the harness gate against its own synthetic fixture (packages/harness/test/fixture); a client layer runs it against its own reference pack
```

Node 22, pnpm 12. Branches `develop`, `staging`, `production` publish `alpha`, `rc`, `latest` to npmjs
through the release workflows. A release needs an author-written changeset (`pnpm changeset`).

## CI secrets

Workflows fetch their secrets from the Infisical project `motor-cms-ci` (environment `prod`) via GitHub OIDC, identity `oidc-motor-ui-design`. The repo only stores `INFISICAL_IDENTITY_ID` and `INFISICAL_PROJECT_SLUG`. This repo uses GitHub's immutable OIDC subject (`repo:motor-cms@33766568/motor-ui-design@1397744402:…`). Merge-down mints its token from the GitHub App `motor-cms-ci-bot`.
