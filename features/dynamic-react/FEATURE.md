# Dynamic React — inline live React/JSX rendering

Compiles a string of JSX/TSX into a runnable React component at runtime and
renders it inline (chat code blocks, notes, and reused by tool UIs / agent
apps). Same execution model as the dynamic tool-UI renderer: Babel transform →
`new Function` with a curated, allowlist-scoped environment.

## Status

Live. `jsx` / `tsx` / `react` fenced code blocks auto-preview when finalized
(see `BlockRenderer.tsx`). Heavy-library support and the `matrx` data SDK are
new (2026-06-19); the SDK is a read-only `tasks` spike.

## Entry points

- `compileReactComponent.ts` — `compileReactComponent({ code, language })`:
  detects needed capabilities from the **original** source (before import
  stripping) via `detectReactCapabilities`, builds an async demand-loaded scope,
  injects the `matrx` SDK, and returns the component. `getReactBlockImports()`
  returns the full set (rarely needed; prefer demand detection).
- `ReactCodeBlock.tsx` — the UI: streaming code → compiling loader → live
  preview → silent code fallback on error (opt-in error details). Has a
  `ReactRenderBoundary` for runtime errors.
- `compile-core.ts` — shared Babel pipeline (`loadBabelTransform`,
  `stripImports`, `replaceExportDefault`, `babelTransform`), used by both this
  feature and the tool-UI compiler.
- `sdk/matrxSdk.ts` — `createMatrxSdk()` → the `matrx` object in scope.

## Capabilities (what generated code can import / use)

The allowlist is **not** owned here — it is the shared async capability registry
at `features/tool-call-visualization/dynamic/allowed-imports.ts`. To widen what
generated code can use, add an entry there (one extension point, every consumer
benefits). Today's set: React hooks, all Lucide icons (missing → placeholder),
`cn`, the common shadcn UI set, `MarkdownStream` (always loaded), plus
demand-only heavy libs `recharts`, `motion/react`, `react-katex`, `react-pdf`,
`xlsx`, `three`, `@react-three/fiber`, `date-fns`, `lodash`.

## The `matrx` Data SDK (RLS-safe data surface)

Generated code calls `matrx.<namespace>.<method>()` to read/write the user's own
data and build custom UIs over it. Invariants:

- Runs **entirely as the current user/org/guest through the browser Supabase
  client** — every call is subject to RLS at the DB. Never service-role, never
  bypasses RLS. Privileges == the session's privileges.
- **Wraps existing feature service layers** (one data path), never inlines raw
  `supabase.from(...)`.
- Namespaces are additive and stable.

Current surface (spike): `matrx.tasks.list()`, `matrx.tasks.get(id)`,
`matrx.tasks.subtasks(id)` — read-only, over `features/tasks/services`.

**Planned (needs design before build):** projects / notes / documents
namespaces, the write surface, a per-app capability manifest (an app declares
which namespaces it uses; user/admin approves), and the guest-privilege model.

## Bundle / SSR invariants (load-bearing)

- The whole compiler is reached only through lazy chunks; Babel is a dynamic
  `import()` on first use. **Nothing is in the SSR or initial client bundle.**
- Every capability loads via a dynamic `import()` with a literal specifier, so
  each is its own chunk. `detectReactCapabilities` loads only referenced
  capabilities → a chart block never downloads three.js; a 3D block never
  downloads recharts. Core (React/common UI/lucide/cn) is in shared chunks, so
  re-importing adds ~nothing.

## Security note

Generated code runs **in the app's JS context** (not an iframe). Appropriate for
trusted / first-party generated content; do not feed it hostile third-party
code. Imports are stripped and only allowlisted deps are injected; unknown
PascalCase identifiers fall back to a placeholder icon instead of crashing.

## Change log

- `2026-06-19` — composer: Initial doc. Added async demand-loaded capability
  scope (heavy libs: recharts/motion/katex/react-pdf/xlsx/three/fiber/date-fns/
  lodash), `detectReactCapabilities` wiring in `compileReactComponent`, and the
  read-only `matrx.tasks` SDK spike (`sdk/matrxSdk.ts`) injected as `matrx`.
