# Handoff — repoint matrx-frontend onto `@ai-matrx/content-ir-react`

**Status:** written, verified against the package, NOT applied. Blocked on one
human step (npm), then it is ~15 minutes of mechanical work.
**Owner:** unassigned.
**Created:** 2026-08-23.

## What this is

`@ai-matrx/content-ir-react` 0.1.0 (`aidream/apps/shared/content-ir-react/`) now
owns the render layer this app used to own alone: the kind route, the
`(kind, platform, role)` component resolver, `KindInstanceRender`, the
provisional/streaming route, the runtime-wrapper chrome, and the generic
structured floor. `apps/dashboard` already renders live kinds through it.

This repo's half is written and sitting in
[`content-ir-react-repoint.patch`](./content-ir-react-repoint.patch) beside this
file. It is NOT committed as source because the package is not yet on npm, and a
`@ai-matrx/content-ir-react` import that cannot resolve breaks `pnpm type-check`
and the build for everyone in this shared checkout.

## The blocker (one human step, npm)

The aidream release workflow runs green through typecheck, the 51-test suite,
publint, Are the Types Wrong, and the packed-tarball dual-loader canary — and
then fails at

```
PUT https://registry.npmjs.org/@ai-matrx%2fcontent-ir-react → 404
```

npm trusted publishing can publish a package that **exists**; it cannot CREATE a
new name. The local token in `~/.npmrc` is also expired (`npm whoami` → 401), so
a manual first publish is not available either.

**What Arman does, once:** open https://www.npmjs.com/settings/ai-matrx/packages
and make `@ai-matrx/content-ir-react` publishable by the aidream repository —
the same setup `@ai-matrx/content-ir` already has (Settings → the package or the
org's "trusted publisher" configuration → GitHub Actions →
`AI-Matrix-Engine/aidream`, workflow `publish-npm-package.yml`). Report back
either "done" or what the page actually offers, because the exact control
depends on whether npm lets a trusted publisher be configured before the first
publish; if it does not, the fallback is one manual `npm publish` of the packed
tarball from a logged-in shell.

Then re-run the already-tagged release:

```bash
gh workflow run publish-npm-package.yml -R AI-Matrix-Engine/aidream -f tag=npm/content-ir-react/v0.1.0
```

## Applying the repoint

```bash
cd /Users/armanisadeghi/code/matrx-frontend
git apply docs/handoffs/content-ir-react-repoint.patch
pnpm add @ai-matrx/content-ir-react@0.1.0
pnpm type-check
pnpm test -- features/content-ir features/workflow-runtime
```

## What the patch does

| File | Change |
|---|---|
| `features/content-ir/host/route-env.ts` | NEW — binds `kindRegistry` + `componentRegistry` + `captureError` + platform `"web"` into the package's `KindRouteEnv`, and declares `artifact` as this app's owned block type. React-free, so reducers and the stream accumulator can import it. |
| `features/content-ir/host/ContentIrHostBoundary.tsx` | NEW — the `ContentIrHost`: `SafeBlockRenderer` as `renderBlock`, `StructuredValueView` as `renderValue`, `ShimmerText` and the `Info` notice as the optional seams. A boundary component rather than one root provider, because kind rendering happens inside many `next/dynamic` islands with no shared ancestor and the host is a module singleton anyway. |
| `features/content-ir/registry/component-registry.ts` | Rewritten as an adapter: `ComponentRegistry extends ComponentResolver` with the Supabase loaders, `captureError`, the `refreshKindComponents` alias, and projection→row narrowing in `ingestDbRows` / `replaceDbRows`. Every existing call site and the ~15 test files are unchanged. |
| `features/content-ir/react/kind-route.ts` | Becomes a binding: re-exports the package's constants and marker helpers, wraps `applyIrKindRoute` / `kindServerDataFromStoredValue` with the Matrix env. Import path and signatures unchanged for ~60 call sites. |
| `features/content-ir/react/partial-kind-route.ts` | Same, for the provisional route. |
| `features/content-ir/react/ProvisionalKindBoundary.tsx` | Thin wrapper over the package's boundary + frame. |
| `features/content-ir/studio/components/KindInstanceRender.tsx` | Thin wrapper; `kindIsRoutable` / `isRecordValue` re-exported. |
| `components/mardown-display/blocks/generic/GenericStructuredBlock.tsx` | Thin wrapper over `GenericStructuredView`, passing this app's `Braces` "Still arriving…" indicator. |
| `components/mardown-display/blocks/runtime-wrappers/NodeOutcomeBlock.tsx` | Thin wrapper over `NodeOutcomeView` / `DelegatedOutput`, passing `SettledOutputBody` as the fallback render function. |
| `components/mardown-display/blocks/runtime-wrappers/RunResultBlock.tsx` | Thin wrapper over `RunResultView`, same fallback. |

Behaviour is intended to be identical. Two deliberate differences worth knowing:

1. `applyIrKindRoute`'s hard-coded `type === "artifact"` skip became the
   `ownedTypes` option, declared in `route-env.ts`.
2. `useContentIrKindVersion` stays local (`react/use-registry-repaint.ts`) and is
   NOT replaced. The package ships the same hook, but it reads its sources from
   the provider, and `BlockRenderer` runs below no provider. The package version
   accepts explicit `sources` for exactly this case if someone later wants to
   collapse the two — it is a 5-line change, not a rewrite.

## After applying

- Update [`features/content-ir/FEATURE.md`](../../features/content-ir/FEATURE.md)
  (what this app still owns vs what the package owns) and its Change Log.
- Update the version table in
  `common-docs/systems/content-ir-twin/FEATURE.md`.
- Delete this handoff and its patch.
