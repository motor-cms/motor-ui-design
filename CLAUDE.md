# Rules for agents in this repo

This repo is public and neutral. Read this before writing anything.

- Design values come from tokens and recipes only. No hard-coded colours, sizes or fonts in blocks or styles.
- Tailwind 4 with the `tw:` prefix, no Preflight, declared layers `@layer theme, base, components, utilities;`, no `important`.
- Responsive behaviour uses container queries on the named container `page` only (`@container/page`, variants `@<bp>/page:`). No viewport media queries in blocks.
- Blocks are plain Vue: no Nuxt APIs, no stores, no Nuxt UI, explicit imports; links and images via props or slots.
- Releases: a push publishes only with an author-written changeset. Never add a step that generates one. The last release tag is found with `git tag --list`, never `git describe`.
- Docs-only commits carry `[skip ci]`.

## Never in this repo

Client names, brand colours, client fonts, page data, screenshots, or anything captured from a local stack
of a client site. Those belong in the client layer repo. `test/no-client-data.test.ts` fails the build on a
list of known terms; do not weaken it and do not add files to its allowlist (only the guard itself is allowed).
Keep the docs neutral too: say "client layer", not the client's name.

## Branch

Work on `staging` directly; `develop` and `production` exist for the `alpha` and `latest` channels (merge-down flows production → staging → develop).
