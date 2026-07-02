---
name: error-capture
description: Add or improve a captured error/warning source in the systemwide Error Inspector. Use when wiring a new error class into the inspector (a new CapturedErrorSource + adapter), calling captureError from a new site, deciding an error's visibility tier (red/orange/yellow), adding a downgrade rule, or turning a loud console.error / swallowed catch into a structured captured error. Triggers on lib/diagnostics/**, captureError, CapturedErrorSource, errorTierRules, "capture this error", "add X to the Error Inspector", "make this a warning", "downgrade/quiet this error", "stop swallowing this error".
---

# Error Capture

> **Read [`features/admin/error-inspector/FEATURE.md`](../../../features/admin/error-inspector/FEATURE.md) first** — the architecture, the adapter list, and the invariants. This skill is the recipe; that doc is the map.

One sink, many adapters. Every error in the app funnels through **`captureError(input)`** (`lib/diagnostics/errorCaptureStore.ts`) into one module-level store the admin Error Inspector reads. Your job when adding a source: feed that one function — **never** stand up a parallel store, slice, or list.

**Structured errors are the rule; generic browser noise is the fallback.** Prefer capturing your own typed error (a stream event, an API body, a domain failure) with its real fields over relying on the `console.error` net.

## The recipe — add a new captured source

1. **Add the source** to the `CapturedErrorSource` union in `lib/diagnostics/errorCaptureStore.ts`, with a one-line doc comment. Name it for its origin (`agent-stream-tool-error`, `media-durability`, `org-resolution`).
2. **Add its label** to `SOURCE_LABELS` in `lib/diagnostics/buildCapturedErrorPayload.ts`. This is `Record<CapturedErrorSource, string>` — **forgetting it is a typecheck error, not a silent gap.** That guardrail is the only thing forcing this step; honor it.
3. **Capture it.** Call `captureError({ source, message, ... })` from the one chokepoint every instance of this error flows through. Three shapes, pick the closest:
   - **Inline at the site** when there's a single loud-recovery point — mirror `lib/organizations/personalOrg.ts` (`source: "org-resolution"`) or `lib/media/durability.ts`.
   - **Extend an existing adapter** when your error is a variant of one already handled — add a branch to `captureStreamError.ts` / `captureApiError.ts`.
   - **A tiny new adapter** in `lib/diagnostics/` when it's a new class with its own plumbing — mirror `captureApiError.ts` (one file, one function, imported at the chokepoint).
4. **Tier it.** Default is **red**. To make a whole source — or one signature — quieter, add a rule to `DOWNGRADE_RULES` in `lib/diagnostics/errorTierRules.ts` pointing at `orange` (dot) or `yellow` (silent). First match wins; put a specific `relation`/`code` rule ABOVE a broad `source` rule.
5. **Verify** — `pnpm type-check` (catches the missing label), then a deterministic `tsx` check: feed your exact error shape through the adapter and assert `getSnapshot()` shows the right `source`/`tier`/fields. No live env needed.

## Non-negotiables

- **Capture never breaks the caller.** Wrap every `captureError` call in `try { … } catch {}`. It runs on hot paths and for **all** users (only the UI is admin-gated).
- **Preserve structured fields — don't flatten into `raw`.** `CaptureInput` carries `code`, `message`, `userMessage`, `details`, `hint`, `status`, `relation`, `requestId`, `conversationId`, `name`, `stack`, `callSite`. Map the real fields; `raw` is the full dump on top, not instead.
- **`userMessage`** is the server's human-facing text (distinct from technical `message`) — the seam for the future user-facing surface. Always set it when the source has one.
- **`relation`** is the "what failed" label shown in lists — a table, `tool:<name>`, `METHOD /path`, a thunk name, an endpoint. Set it.
- **Tier is VISIBILITY, not log level.** red = clear error (loud) · orange = minor (dot) · yellow = silent. A "warning" is just a source you tier `orange`/`yellow` — there is no separate warning concept.

## Tiering judgment (current seeds, in `errorTierRules.ts`)

- **Real, unhandled failures → red** (default): stream errors, Supabase, uncaught exceptions, react-render, `org-resolution`, api 5xx.
- **Handled / already-shown → orange**: `user-toast`, `redux-rejected` (the slice rolled back).
- **Normal operation / by-design → yellow**: `agent-stream-tool-error` (the agent tries a query, the guard rejects it, the agent adapts), aborted requests, `total_timeout`, ResizeObserver noise.
- Match on `source` for a class; add `code`/`relation`/`messageIncludes` to a higher rule to carve out one signature. The admin tunes this live — **"Copy for AI" embeds a paste-ready rule stub** (`buildDowngradeRuleStub`).

## Persistence (automatic)

A **red-tier** capture auto-persists (prod + authenticated, deduped, throttled) to
the canonical `public.system_error` sink via the `log_client_error` RPC
(`lib/diagnostics/persistCapturedErrors.ts`). So **tier choice = persistence
choice**: a new red source lands in the server error dashboard for free; orange/
yellow stay client-only. No per-source wiring needed. Don't add a parallel
persistence path — extend the RPC (`migrations/log_client_error.sql`) if a new
field must reach the DB.

## React boundaries

New error boundary → use `lib/error-boundary/ErrorBoundaryWithCapture.tsx` (capture built-in). Migrating a bespoke `componentDidCatch` → add one line: `captureReactRenderError(error, { boundary, relation, componentStack })` (`lib/diagnostics/captureReactError.ts`). Route `error.tsx` boundaries are already covered at `components/errors/ErrorBoundaryView.tsx` — don't re-wire each one.

## After you ship

Update [`features/admin/error-inspector/FEATURE.md`](../../../features/admin/error-inspector/FEATURE.md): add your adapter to the list and a dated Change Log line.
