# Version Skew & Error Boundaries — `components/errors/`

Status: **live**. Owns the app-level error boundary UI and the deploy-skew system: what happens when a tab from an old build meets a new production deployment.

## The one law

**Never reload a live session on the user's behalf.** An auto-reload once destroyed a page full of unsaved work mid-interaction. The user refreshes on their terms — every surface offers a Refresh *button* or the consent toast, nothing more. The single exception: pre-hydration initial load (nothing exists to lose), loop-guarded via `sessionStorage`.

## Layers (all in this folder unless noted)

| Layer | File | Role |
|---|---|---|
| Prevention | Vercel **native Skew Protection** (Project Settings → Advanced — NOT `next.config.js deploymentId`, which is broken under Turbopack; see the comment at `next.config.js` `deploymentId`) | Old deployments keep serving their own chunks; stale tabs mostly never error. |
| Proactive prompt | `NewVersionWatcher.tsx` (mounted in `app/layout.tsx`) | Bakes this deployment's `VERCEL_DEPLOYMENT_ID` in server-side, polls `app/api/version/route.ts` (custom fetches are not pinned by skew protection → always answers from the latest deploy), and on mismatch shows the sonner toast: "A new version is available — Refresh to see the latest changes" with **Refresh / Not now** (30-min snooze). |
| Pre-hydration guard | `ChunkRecoveryBootScript.tsx` (inline `<head>` script) | Chunk 404 **before** React boots → one loop-guarded reload (lossless). **After** boot (`__MATRX_APP_BOOTED__`, set by `NewVersionWatcher`) → dispatches `matrx:stale-chunk` instead; the watcher shows the firmer "This page is out of date" toast. |
| Boundaries | `ErrorBoundaryView.tsx` (all route `error.tsx` delegate here), `app/global-error.tsx` | Chunk-shaped error → calm "This page is out of date" prompt with Refresh button. Non-chunk errors → normal error UI + `captureReactRenderError` into the Error Inspector. |
| Detection helpers | `chunk-load-recovery.ts` | `STALE_CHUNK_PATTERNS` (THE pattern set), `hasStaleChunkSignature()`, `isChunkLoadError()`, `notifyStaleChunk()` (dispatches `matrx:stale-chunk`), `STALE_CHUNK_EVENT`, `APP_BOOTED_FLAG`. Every detector tests against `STALE_CHUNK_PATTERNS`; the boot script is a standalone inline string and is the ONE allowed copy — keep its regexes in sync. |
| Overlay chunks | `features/overlays/boundary/lazyOverlay.tsx` | Per-overlay boundary + hung-import timeout; reload there is a user-clicked last-resort button only. |
| Auth landing | `components/auth/HardRedirectForm.tsx` | Password login/signup success lands via **full-document navigation** (`window.location.assign`), never a soft server-action `redirect()`. A stale /login tab's old runtime otherwise soft-navigates and 404s on the destination's chunks — /welcome (the universal first landing) was the top victim. Auth actions return `{ hardRedirect }` on success; error paths keep `redirect()`. |

## Invariants

- **No `window.location.reload()` on any automatic path** post-boot. New recovery code screams (toast/boundary prompt), it never acts.
- The boot script is dependency-free inline JS — it must never import a chunk.
- `/api/version` is `force-dynamic`, `no-store`, and returns `deploymentId: null` off-Vercel → watcher polling disabled locally (the `matrx:stale-chunk` listener still works).
- Toast copy is the Supabase pattern: one sentence, **Refresh** + **Not now**, `duration: Infinity`, deduped by toast id.
- **Visible Sonner toast cards restore `pointer-events: auto`.** Modal drawers disable body hit-testing; without this override, a toast paints above the sheet while taps pass through it.

## Change Log

- 2026-08-22 — **A stale-graph failure that says nothing about "chunks" reached the raw error boundary.** Turbopack reports a superseded module graph as `Module 7163177 was instantiated because it was required from module 5477232, but the module factory is not available` — the same deploy-skew failure this system exists to absorb, but no pattern matched it, so a user testing `/work/conversations/[id]` got a generic error page instead of the **This page is out of date → Refresh** toast (a plain reload recovered it, confirming the diagnosis). Added the pattern, and collapsed the drifted second copy in `features/overlays/boundary/overlayErrorReport.ts` onto the new shared `STALE_CHUNK_PATTERNS` / `hasStaleChunkSignature()` — that copy is exactly why the gap existed. Covered by `components/errors/__tests__/chunk-load-recovery.test.ts`.
- 2026-08-20 — Restored hit-testing on visible Sonner toast cards so **Refresh** and **Not now** remain tappable above modal mobile drawers.
- 2026-08-15 — Root boot scripts use tracked `next/script` `beforeInteractive` entries instead of raw React `<script>` children, preserving pre-hydration recovery without triggering React 19.2 hydration recovery.
- 2026-07-29 — Users reported "This page is out of date" on /welcome: stale /login tabs soft-navigated after sign-in and 404'd on the new build's chunks. Added `HardRedirectForm` — auth success now lands via full-document navigation; deleted dead `sign-up/Basic.tsx` + `AlternativeSignUp.tsx`.
- 2026-07-10 — Killed all post-boot auto-reloads (boot script, `ErrorBoundaryView`, `global-error`); added `NewVersionWatcher` + `/api/version` consent toast; boot script now disarms after boot via `__MATRX_APP_BOOTED__`.
