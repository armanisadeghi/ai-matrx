# Error Inspector (admin)

Global, always-on capture of **every runtime error** in the live browser
session — Supabase/PostgREST, uncaught exceptions, unhandled rejections,
`console.error`, Python-backend HTTP failures, and React render errors — surfaced
in an admin-only WindowPanel with full raw detail, a visibility tier, a
ready-to-paste downgrade rule, and "Copy for AI".

Status: **shipped**. Originally the Supabase-only inspector (2026-06-26);
generalized to systemwide + tiered (2026-06-28).

## Architecture: one sink, many adapters

A single module store (`lib/diagnostics/errorCaptureStore.ts`) is the sink; each
error class has its own capture adapter feeding it via `captureError(...)`. A
module store (not Redux) is deliberate — the Supabase proxy is imported by the
client that 1,000+ files depend on; Redux coupling there, or missing
pre-hydration errors, would be wrong. React reads it via `useCapturedErrors` /
`useCapturedErrorStats` (`useSyncExternalStore`). Max 300 distinct entries,
newest-first, identical signatures deduped with an occurrence count.

**Doctrine: structured errors are the rule, generic browser errors the fallback.**
The high-value adapters consume our OWN typed error channels (the agent stream,
the Python API, Supabase). `console.error` / `window 'error'` / rejections are
the safety net, not the main event.

**Capture adapters (all → `captureError`):**

- **Agent stream (the central artery)** — `lib/diagnostics/captureStreamError.ts`.
  `captureStreamEvent` is wired at the ONE chokepoint every stream consumer pulls
  events through: `parseNdjsonStream` (`lib/api/stream-parser.ts`). It captures
  every server-emitted typed error/failure — `error` (ErrorPayload), `warning`,
  `tool_event`/`tool_error`, `provider_retry` (cancelled/suspended),
  `record_update` `status:"failed"`, error-bearing `data` events — each with a
  server-origin `source` (`agent-stream-*`) and `error_type`/`code`/`user_message`
  intact. Transport failures → `captureStreamTransportError`; client-side stream
  death (heartbeat/timeout) arrives as an exception, so `run-ai-stream.ts`'s catch
  calls `captureStreamClientError`.
- **Supabase** — `lib/diagnostics/supabaseErrorCapture.ts`, a transparent Proxy
  on the browser client (`utils/supabase/client.ts`). Intercepts `from`/`rpc`/
  `schema`; captures raw PostgREST `code`/`message`/`details`/`hint`/`status` +
  operation + table/fn + a cleaned call-site. A cancelled request is normalized
  to `name: "AbortError"` here: postgrest-js RESOLVES an aborted fetch with an
  error object (no throw), so it takes the `supabase-postgrest` resolved-error
  path — tagging it with the canonical abort name lets the one `request-aborted`
  rule silence it (matching `captureApiError`'s abort handling).
- **Global runtime** — `lib/diagnostics/globalErrorCapture.ts`,
  `installGlobalErrorCapture()`: `window` 'error' + `unhandledrejection` (passive
  listeners, every environment) and a `console.error` wrapper (noise-filtered via
  `lib/console-noise.ts`). Installed once for **every user** from
  `app/DeferredSingletons.tsx`. This is the single owner of those listeners — the
  old `adminDebugSlice` listeners were retired.
  - **The `console.error` wrapper runs only OUTSIDE development.** Reassigning
    global `console.error` inserts our frame between the caller and Next.js's dev
    error overlay, corrupting its origin attribution (it would blame this file).
    In `next dev` the overlay already surfaces every `console.error`, so the
    wrapper is pure downside there; in prod/preview there is no overlay and the
    Inspector is the one surface. Never reinstate the dev wrap.
- **Python backend** — `lib/diagnostics/captureApiError.ts`, called from the one
  error chokepoint in `lib/api/call-api.ts`. Every non-2xx / network failure;
  extracts the backend's structured `error_type`/`code`/`user_message`/`request_id`
  instead of flattening `serverDetail`.
- **React render** — `lib/diagnostics/captureReactError.ts`,
  `captureReactRenderError()`. Boundaries swallow errors (the global listener
  can't see them), so a boundary opts in from `componentDidCatch`. The single
  high-leverage point is `components/errors/ErrorBoundaryView.tsx` (every route
  `error.tsx` delegates to it). New boundaries should use the shared
  `lib/error-boundary/ErrorBoundaryWithCapture.tsx` primitive (capture built-in).
  Bespoke boundaries already wired: `OverlayErrorBoundary`, both
  `MessageErrorBoundary`s, `ToolRendererErrorBoundary`, `MarkdownErrorBoundary`,
  `AgentAppErrorBoundary`, `EmitRendererErrorBoundary`, `PreviewErrorBoundary`.
  The few low-traffic ones left (settings/builder/demo/latex/link/json) adopt
  the primitive or the one-liner.
- **Redux** — `lib/diagnostics/reduxErrorCaptureMiddleware.ts`, registered in
  `lib/redux/store.ts`. Captures every RTK rejected thunk that's a real failure
  (skips aborted / condition-false); `relation` = the thunk name; tiered
  **orange** (handled-by-slice). Promote a critical slice to red, or silence a
  noisy one, by matching `relation` in `errorTierRules.ts`.
- **Domain** — `lib/media/durability.ts` (`reportMediaDurabilityViolation` →
  `media-durability`) and `lib/toast-service.ts` (`toast.error` → `user-toast`,
  tiered orange: already handled + shown to the user).

Capture is in-memory, cheap, try/caught — it can never break a caller — and runs
for **all** users. Only the UI is admin-gated, which is the seam for the future
"surface certain errors to end users" feature (`user_message` is captured for it).

## Tiers + downgrade rules (`lib/diagnostics/errorTierRules.ts`)

Every error is classified into a **visibility tier** (NOT a log level) at capture
time. Default is `red` — nearly everything is loud until tuned.

- **red** — Clear Error. Full badge/pill; pulses while unseen.
- **orange** — Minor. Small dot only.
- **yellow** — Silent. Listed only inside the inspector.

Seeded defaults (in `DOWNGRADE_RULES`): **tool errors → yellow** (a failed tool
call is normal agent operation — the agent adapts; e.g. the sql guard rejecting
`grant`/`delete from`), **redux-rejected → orange**, **user-toast → orange**.
Everything else stays red until tuned. Promote a specific tool/slice to red with
a `relation` rule ABOVE the broad source rule.

**To quiet an error**, add a rule to `DOWNGRADE_RULES` in `errorTierRules.ts`
pointing a match at `orange`/`yellow`. Rules are evaluated top-down, first match
wins; specific (code+relation) above broad (whole source); an empty `match`
matches nothing by design. `classifyTier()` is the engine; the colors are in
`errorTiers.ts`.

The canonical loop: admin sees a red error → **Copy for AI** (the payload embeds
a `<suggested-downgrade-rule>` built by `buildDowngradeRuleStub`, matching that
exact error) → an agent pastes it into `errorTierRules.ts` and sets the tier →
reload reclassifies it. This is the ONLY way to downgrade — no per-error UI toggle.

## Copy for AI

`buildCapturedErrorPayload.ts` adapts a captured error (or the whole set) into
the canonical `AgentPayloadInput` consumed by `components/agent-copy` — XML
envelope naming the source, route, call-site, operation, table/fn/endpoint, the
tier, the full raw error, and the suggested downgrade rule.

## Entry points

- **Sidebar Administration section** (every route, any admin) —
  `SidebarErrorInspectorToggle` in `AdminSidebarSection`; shows a red count or
  orange dot inline. Mobile parity: a button in `AdminMobileMenu`.
- Avatar/admin menu → "Error Inspector" (`ErrorInspectorMenuItem`).
- Floating badge (`ErrorInspectorBadge`, `app/DeferredSingletons.tsx`): red pill,
  else orange dot, else silent. Reflects the loudest tier.
- Overlay id: `errorInspectorWindow` (singleton, ephemeral). Open via
  `useOpenErrorInspector` / `useToggleErrorInspector`.
- **Minimized preview** (`ErrorInspectorTrayChip` → shared `TrayStatusChip`): the
  minimized window shell shows a bug icon coloured by the **loudest** captured
  tier (blue when clear → yellow → amber → red), the total distinct count, and a
  per-tier breakdown — live from the module store via `useCapturedErrorStats`, so
  re-renders are isolated to that leaf (zero page impact). Registered in
  `features/window-panels/registry/trayPreviewRegistry.ts`.

UI self-gates on `selectIsAdmin` (any admin level), not super-admin.

## Registration sites (keep in sync)

`features/window-panels/registry/overlay-ids.ts` ·
`features/window-panels/registry/windowRegistryMetadata.ts` ·
`features/overlays/catalogue.ts` ·
`features/overlays/OverlayController.tsx` (lazy import + `isOpenById` +
`dataById` + render block).

## Relationship to adminDebugSlice

`adminDebugSlice` keeps route context + namespaced `debugData` for the
"Copy Context" panel (`LargeIndicator`). Its console/runtime-error capture was
**removed** — that's now the single capture path above. `LargeIndicator` reads
those errors from the module store via `useCapturedErrors`. There is no parallel
listener set.

## Extending

**Invoke the `error-capture` skill** before adding/improving a captured source,
adapter, or tier rule — it holds the full recipe + invariants.

- New error source → add to the `CapturedErrorSource` union, add its label to
  `SOURCE_LABELS` (the `Record` typecheck enforces it), call `captureError({
  source, ... })` from the chokepoint. Store + UI are source-agnostic.
- New raw field → add to `CapturedError` + `CaptureInput`
  (`errorCaptureStore.ts`), populate in the adapter, render in
  `ErrorInspectorWindow`, include in `buildCapturedErrorPayload`.
- New downgrade → edit `DOWNGRADE_RULES` only.

## Change Log

- 2026-07-01 — **Aborted Supabase requests no longer show red.** postgrest-js
  RESOLVES a cancelled request with an error object (message `"AbortError: The
  operation was aborted."`) instead of throwing, so it took the
  `supabase-postgrest` resolved-error path where the `request-aborted` rule (keyed
  on `name: "AbortError"`) couldn't reach it — one cancelled RPC (e.g.
  `get_usage_status` on `/files/all`, from `useStorageQuota`'s superseding fetch)
  surfaced as a red error. `captureResult` now normalizes that shape to
  `name: "AbortError"` and the `request-aborted` rule lists `supabase-postgrest`,
  so every aborted call site across the app is silenced by the one canonical rule.
- 2026-06-30 — Added the **`error-capture` skill** (the recipe for new sources/
  adapters/tiers). Fixed the `org-resolution` source missing its `SOURCE_LABELS`
  entry (a typecheck break).
- 2026-06-29 — Detail pane focuses on the error: the downgrade-rule block moved
  out of the middle into a collapsed "Downgrade rule" disclosure at the bottom
  (the Copy-for-AI payload still embeds it with instructions).
- 2026-06-29 — **Minimized preview.** The inspector's minimized window shell now
  shows `ErrorInspectorTrayChip` (a bug icon coloured by the loudest tier + total
  + per-tier breakdown) instead of an empty card, built on the new reusable
  `features/window-panels/.../TrayStatusChip` primitive. Live from the module
  store; isolated re-renders. First consumer of the canonical minimized-preview
  system (see `features/window-panels/FEATURE.md`).
- 2026-06-29 — **Tiering + remaining arteries.** Tool errors default **yellow**
  (normal agent operation). Added the global Redux `*/rejected` middleware
  (`redux-rejected`, orange) — the last systemic gap. Built the shared
  `ErrorBoundaryWithCapture` primitive and wired AgentApp/Emit/Preview boundaries.
- 2026-06-29 — **Structured-error arteries.** Added the agent-stream adapter
  (`captureStreamError`) at the `parseNdjsonStream` chokepoint — captures every
  server-emitted typed error/warning/tool-error/provider-retry/record-failure,
  the thing the inspector had been missing while it caught only the FE's
  downstream `console.error`. Added structured fields (`userMessage`/`requestId`/
  `conversationId`), enriched `captureApiError`, wired the route-boundary
  chokepoint (`ErrorBoundaryView`) + top content boundaries, and added
  media-durability + toast.error capture.
- 2026-06-28 — Gated the `console.error` wrapper to non-development. In `next dev`
  it corrupted Next's error-overlay origin attribution (blamed
  `globalErrorCapture.ts` instead of the real caller) and duplicated the overlay;
  window/rejection listeners and all other sources are unaffected.
- 2026-06-28 — Generalized to **systemwide + tiered**: broadened the store/UI off
  Supabase-only; added global-runtime / api-http / react-render adapters; added
  the red/orange/yellow tier model + agent-editable `errorTierRules.ts` downgrade
  system + Copy-for-AI rule stubs; retired the duplicate `adminDebugSlice`
  listeners; added the sidebar Administration entry (desktop + mobile).
- 2026-06-26 — Initial build: Supabase capture proxy + module store + admin
  window + floating badge + Copy-for-AI.
