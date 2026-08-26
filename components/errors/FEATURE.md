# Load Recovery & Error Boundaries — `components/errors/`

Status: **live**. Owns app-level error boundaries, explicit chunk-load recovery, and the evidence-backed new-deployment prompt.

## The one law

**Never reload a live session on the user's behalf.** An auto-reload once destroyed a page full of unsaved work mid-interaction. The user refreshes on their terms — every surface offers a Refresh *button* or the consent toast, nothing more. The single exception: pre-hydration initial load (nothing exists to lose), loop-guarded via `sessionStorage`.

## Layers (all in this folder unless noted)

| Layer | File | Role |
|---|---|---|
| Prevention | Vercel **native Skew Protection** (Project Settings → Advanced — NOT `next.config.js deploymentId`, which is broken under Turbopack; see the comment at `next.config.js` `deploymentId`) | Old deployments keep serving their own chunks; stale tabs mostly never error. |
| Proactive prompt | `NewVersionWatcher.tsx` (mounted in `app/layout.tsx`) | Bakes this deployment's `VERCEL_DEPLOYMENT_ID` in server-side, polls `app/api/version/route.ts` (custom fetches are not pinned by skew protection → always answers from the latest deploy), and on mismatch shows the sonner toast: "A new version is available — Refresh to see the latest changes" with **Refresh / Not now** (30-min snooze). |
| Pre-hydration guard | `ChunkRecoveryBootScript.tsx` (inline `<head>` script) | Explicit chunk fetch failure **before** React boots → one loop-guarded reload (lossless). **After** boot (`__MATRX_APP_BOOTED__`, set by `NewVersionWatcher`) → dispatches `matrx:chunk-load-error`; the watcher offers a cause-neutral Refresh prompt. |
| Boundaries | `ErrorBoundaryView.tsx` (all route `error.tsx` delegate here), `app/global-error.tsx`, `MarkdownErrorBoundary.tsx` | Explicit chunk-load failure → calm recovery prompt/event, never an Error Inspector render defect. Non-chunk errors → normal error UI + Error Inspector capture. |
| Detection helpers | `chunk-load-recovery.ts` | `CHUNK_LOAD_ERROR_PATTERNS` (THE explicit-fetch pattern set), `hasChunkLoadErrorSignature()`, `isChunkLoadError()`, `notifyChunkLoadError()`, `CHUNK_LOAD_ERROR_EVENT`, `APP_BOOTED_FLAG`. Generic runtime errors never enter this path. The boot script is the ONE allowed inline pattern copy; keep it in sync. |
| Overlay chunks | `features/overlays/boundary/lazyOverlay.tsx` | Per-overlay boundary + hung-import timeout; reload there is a user-clicked last-resort button only. |
| Auth landing | `components/auth/HardRedirectForm.tsx` | Password login/signup success lands via **full-document navigation** (`window.location.assign`), never a soft server-action `redirect()`. A stale /login tab's old runtime otherwise soft-navigates and 404s on the destination's chunks — /welcome (the universal first landing) was the top victim. Auth actions return `{ hardRedirect }` on success; error paths keep `redirect()`. |

## Invariants

- **No `window.location.reload()` on any automatic path** post-boot. New recovery code screams (toast/boundary prompt), it never acts.
- The boot script is dependency-free inline JS — it must never import a chunk.
- `/api/version` is `force-dynamic`, `no-store`, and returns `deploymentId: null` off-Vercel → watcher polling disabled locally (the `matrx:chunk-load-error` listener still works).
- **Never infer deployment skew from an error signature or successful refresh.** Only a deployment-ID mismatch may claim that a new version exists; recovery UI for load failures states only the observed failure.
- Toast copy is the Supabase pattern: one sentence, **Refresh** + **Not now**, `duration: Infinity`, deduped by toast id.
- **Visible Sonner toast cards restore `pointer-events: auto`.** Modal drawers disable body hit-testing; without this override, a toast paints above the sheet while taps pass through it.

## Change Log

- 2026-08-26 — Nested Markdown boundaries route explicit lazy-renderer chunk failures to `NewVersionWatcher` instead of misclassifying them as Markdown render defects.
- 2026-08-23 — Removed the false “page is out of date” diagnosis. Turbopack’s generic `module factory is not available` runtime failure can occur on fresh loads; it is no longer classified or suppressed as deploy skew, while explicit chunk failures use cause-neutral recovery copy. Detection, pre-boot handling, overlays, boundaries, and regression tests now share that contract.
- 2026-08-22 — Centralized explicit chunk-fetch signatures in `CHUNK_LOAD_ERROR_PATTERNS` for route and overlay boundaries. A generic Turbopack runtime-integrity message was temporarily included and was removed on 2026-08-23 because it did not prove deploy skew.
- 2026-08-20 — Restored hit-testing on visible Sonner toast cards so **Refresh** and **Not now** remain tappable above modal mobile drawers.
- 2026-08-15 — Root boot scripts use tracked `next/script` `beforeInteractive` entries instead of raw React `<script>` children, preserving pre-hydration recovery without triggering React 19.2 hydration recovery.
- 2026-07-29 — Stale `/login` tabs soft-navigated after sign-in and 404'd on `/welcome` chunks. Added `HardRedirectForm` so auth success lands via full-document navigation; deleted dead `sign-up/Basic.tsx` + `AlternativeSignUp.tsx`.
- 2026-07-10 — Killed all post-boot auto-reloads (boot script, `ErrorBoundaryView`, `global-error`); added `NewVersionWatcher` + `/api/version` consent toast; boot script now disarms after boot via `__MATRX_APP_BOOTED__`.
