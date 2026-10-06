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

- `compileCodeBlock.ts` — `compileCodeBlock({ code, language })`: the block
  compiles through `@ai-matrx/code-runtime` (`compileAsync`) with the
  package's core entries plus `detectEntries` (imports and bare heavy-library
  names), the `matrx` SDK as a host override, and the "conventional names
  first" component rule.
- `ReactCodeBlock.tsx` — the UI: streaming code → compiling loader → live
  preview → silent code fallback on error (opt-in error details). Has a
  `ReactRenderBoundary` for runtime errors.
- `sdk/matrxSdk.ts` — `createMatrxSdk()` → the `matrx` object in scope.

## Capabilities (what generated code can import / use)

Not owned here: the ONE documented scope registry is `@ai-matrx/code-runtime`'s
(`listScopeEntries()`); the app supplies its own modules through
`lib/code-runtime/app-scope.ts`. Heavy libraries (`recharts`, `motion/react`,
`react-katex`, `react-pdf`, `xlsx`, `three`, `@react-three/fiber`, `date-fns`,
`lodash`) load only when a block references them. Unknown names render a marked
placeholder.

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

- The whole compiler is reached only through the lazy `ReactCodeBlock` chunk.
  **Nothing is in the SSR or initial client bundle.**
- Heavy libraries load through literal-specifier `import()` boundaries in
  `lib/code-runtime/app-scope.ts`, each its own chunk, fetched only when
  referenced. Lucide is never an async `import("lucide-react")` boundary.

## Security note

Generated code runs **in the app's JS context** (not an iframe). Appropriate for
trusted / first-party generated content; do not feed it hostile third-party
code. Only documented scope entries resolve; unknown names render a marked
placeholder instead of crashing.

## Change log

- `2026-10-06` — Applets AP-5: the block compiles through `@ai-matrx/code-runtime`; `compileReactComponent.ts`, `compile-core.ts` and the second scope registry `toolRendererScope.ts` are deleted.

- `2026-08-30` — Removed application-owned dynamic imports of the full `lucide-react` namespace. Dynamic React loads the canonical curated map and retains its missing-icon fallback, preventing Turbopack from instantiating the Lucide barrel before its base factory.
- `2026-06-19` — composer: Initial doc. Added async demand-loaded capability
  scope (heavy libs: recharts/motion/katex/react-pdf/xlsx/three/fiber/date-fns/
  lodash), `detectReactCapabilities` wiring in `compileReactComponent`, and the
  read-only `matrx.tasks` SDK spike (`sdk/matrxSdk.ts`) injected as `matrx`.
