# Supabase Error Inspector (admin)

Global, always-on capture of every Supabase / PostgREST error in the live
browser session, surfaced in an admin-only WindowPanel with full raw detail and
"Copy for AI". Built for the 2026 DB transition, where moved tables and renamed
RPCs break queries scattered across the app and the priority is **total
visibility** into the exact errors as they happen — on any page, without hunting.

Status: **shipped** (2026-06-26).

## How it works

1. **Capture layer (no React, no Redux).** `utils/supabase/client.ts` wraps the
   browser client with `wrapClientForCapture` (`lib/diagnostics/supabaseErrorCapture.ts`).
   A transparent Proxy intercepts only `from` / `rpc` / `schema`; every builder
   chain stays wrapped so the terminal `await` (its `.then`) is instrumented.
   When a call resolves with `{ error }` or its promise rejects, the error is
   recorded with the raw PostgREST fields (`code`, `message`, `details`, `hint`,
   `status`), the operation verb, schema, table/function, the route, and a
   cleaned **call-site** (the component/hook/service that issued the query —
   captured lazily so successful queries pay ~nothing).
   - Browser-only by construction (wraps the browser client). Server client is
     untouched.
   - Every real method runs on the real client via `Reflect`/`apply`, so private
     state, `instanceof`, and chaining behave exactly as before. Capture is
     wrapped in try/catch — it can never break a caller.

2. **Store.** `lib/diagnostics/errorCaptureStore.ts` — a module-level ring buffer
   (max 300 distinct entries, newest-first, identical signatures deduped with an
   occurrence count). React reads it via `useCapturedErrors` /
   `useCapturedErrorStats` (`useSyncExternalStore`). A module store (not a Redux
   slice) is deliberate: the capture proxy is imported by the supabase client
   that 1,000+ files depend on — pulling Redux into that graph, or missing
   pre-hydration errors, would be wrong.

3. **UI.** `ErrorInspectorWindow.tsx` (WindowPanel: filterable list + full detail
   + per-error and whole-list Copy/Copy-for-AI + clear/dismiss) and
   `ErrorInspectorBadge.tsx` (floating chip, bottom-left, pulses on unseen
   errors). Both **self-gate on `selectIsAdmin`** (any admin level).

4. **Copy for AI.** `buildCapturedErrorPayload.ts` adapts a captured error (or
   the whole set) into the canonical `AgentPayloadInput` consumed by the shared
   `components/agent-copy` primitive — XML envelope naming the origin route,
   call-site, operation, table/function, and the full raw error.

## Entry points

- Avatar/admin menu → "Supabase Errors" (`ErrorInspectorMenuItem`, in
  `UserMenuPanel`'s admin group).
- Floating badge (admin-only, appears once ≥1 error captured), mounted in
  `app/DeferredSingletons.tsx`.
- Overlay id: `errorInspectorWindow` (singleton, ephemeral).

## Registration sites (keep in sync)

`features/window-panels/registry/overlay-ids.ts` ·
`features/window-panels/registry/windowRegistryMetadata.ts` ·
`features/overlays/catalogue.ts` ·
`features/overlays/OverlayController.tsx` (lazy import + `isOpenById` +
`dataById` + render block).

## Scope / relationship to adminDebugSlice

This owns the **Supabase-error** concern, which previously had no dedicated
capture. It does NOT re-net generic `console.error` / window `error` /
`unhandledrejection` — `components/admin/debug/AdminDebugContextCollector` +
`adminDebugSlice` already do that. Failed Supabase network calls that reject are
captured here via the builder's reject path (`supabase-exception`).

## Extending

- New raw field to surface → add to `CapturedError` + `CaptureInput`
  (`errorCaptureStore.ts`), populate in `supabaseErrorCapture.ts`, render in
  `ErrorInspectorWindow` and include in `buildCapturedErrorPayload`.
- Want non-Supabase nets (uncaught exceptions, raw `fetch`) in the same
  inspector → add a global listener that calls `captureError(...)` with a new
  `CapturedErrorSource`. The store and UI are source-agnostic.

## Change Log

- 2026-06-26 — Initial build: capture proxy + module store + admin window +
  floating badge + Copy-for-AI, wired into the supabase client, overlay system,
  admin menu, and DeferredSingletons.
