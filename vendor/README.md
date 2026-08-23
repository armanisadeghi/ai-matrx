# `vendor/` — packed tarballs of `@ai-matrx/*` packages awaiting their first npm publish

**One rule: nothing lives here permanently.** A tarball in this directory is a
BRIDGE between "the shared package is built and tested" and "the shared package
exists on the npm registry". Every entry has a named human step that removes it.

## Why a tarball instead of `link:`/`workspace:`

The package source lives in another repo (`aidream/apps/shared/<name>/`). A
`link:` or `workspace:` spec pointing there would resolve on Arman's machine and
nowhere else — Vercel, CI, and every cloud agent session would fail to install.
A tarball committed here is self-contained: `pnpm install` works everywhere, and
the artifact is byte-identical to what `npm publish` would upload (`pnpm pack`
applies the package's `publishConfig`, so the `exports` map already points at
`dist/`, not at source).

## Current entries

| Tarball | Package | Removed when |
|---|---|---|
| `ai-matrx-content-ir-react-0.1.0.tgz` | `@ai-matrx/content-ir-react` 0.1.0 | `@ai-matrx/content-ir-react` is publishable on npm (see below), then swap the spec to `"0.1.0"` and delete the file. |

### The one human step for `content-ir-react`

npm trusted publishing can publish a package that already EXISTS; it cannot
create a new name, and the local token is expired. Arman opens
<https://www.npmjs.com/settings/ai-matrx/packages> and makes
`@ai-matrx/content-ir-react` publishable by `AI-Matrix-Engine/aidream`
(workflow `publish-npm-package.yml`) — the same setup `@ai-matrx/content-ir`
already has. Then:

```bash
gh workflow run publish-npm-package.yml -R AI-Matrix-Engine/aidream -f tag=npm/content-ir-react/v0.1.0
```

and here:

```bash
pnpm remove @ai-matrx/content-ir-react && pnpm add @ai-matrx/content-ir-react@0.1.0
git rm vendor/ai-matrx-content-ir-react-0.1.0.tgz
```

## Regenerating a tarball

```bash
cd ../aidream/apps/shared/content-ir-react && pnpm pack --pack-destination ../../../../matrx-frontend/vendor
```

`pnpm pack` runs `prepack` → `tsup`, so the tarball always carries a fresh
`dist/`. Bump the version in the package first; never overwrite a tarball whose
filename already appears in `pnpm-lock.yaml` with different bytes.

## The guard

`pnpm check:registry-deps` reports every `file:` spec as a TEMPORARY BRIDGE with
its removal step. It does not fail the build (a committed tarball is installable
everywhere) — it exists so nobody forgets these are here.
