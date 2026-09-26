# Load Recovery & Error Boundaries — `components/errors/`

Status: **live**. Owns app-level error boundaries, explicit chunk-load recovery, and the evidence-backed new-deployment prompt.

## The one law

**Never reload a live session on the user's behalf.** An auto-reload once destroyed a page full of unsaved work mid-interaction. The user refreshes on their terms — every surface offers a Refresh *button* or the consent toast, nothing more. The single exception: pre-hydration initial load (nothing exists to lose), loop-guarded via `sessionStorage`.

## Layers (all in this folder unless noted)

| Layer | File | Role |
|---|---|---|
| Prevention | Vercel **native Skew Protection** (Project Settings → Advanced — NOT `next.config.js deploymentId`, which is broken under Turbopack; see the comment at `next.config.js` `deploymentId`) | Old deployments keep serving their own chunks; stale tabs mostly never error. |
| Proactive prompt | `NewVersionWatcher.tsx` (mounted in `app/layout.tsx`) | Bakes this deployment's `VERCEL_DEPLOYMENT_ID` in server-side, polls `app/api/version/route.ts` (custom fetches are not pinned by skew protection → always answers from the latest deploy), and on mismatch shows the sonner toast: "A new version is available — Refresh to see the latest changes" with **Refresh / Not now** (30-min snooze). |
| Directed prompt | `refresh-directive.ts` + the `matrx:refresh-required` window event | The platform client-directive channel's `refresh_required` (server-published on `matrx-server-bus:*`, received by `components/client-directives/PlatformDirectiveSubscriber.tsx`) lands in the SAME toast with optional operator copy. It is an ask, not a command: there is no code path from a directive to `location.reload()`. Contract: `../../../common-docs/systems/platform/realtime/CLIENT-DIRECTIVES.md`. |
| Pre-hydration guard | `ChunkRecoveryBootScript.tsx` (inline `<head>` script) | Explicit chunk fetch failure **before** React boots → one loop-guarded reload (lossless). **After** boot (`__MATRX_APP_BOOTED__`, set by `NewVersionWatcher`) → dispatches `matrx:chunk-load-error`; the watcher offers a cause-neutral Refresh prompt. |
| Boundaries | `ErrorBoundaryView.tsx` (all route `error.tsx` delegate here), `app/global-error.tsx`, `MarkdownErrorBoundary.tsx` | Explicit chunk-load failure → calm recovery prompt/event, never an Error Inspector render defect. Non-chunk errors → normal error UI + one structured `react-render` capture; the DevTools scream uses `mirrorCapturedErrorToConsole`, never a second durable `console-error`. |
| Detection helpers | `chunk-load-recovery.ts` | `CHUNK_LOAD_ERROR_PATTERNS` (THE explicit-fetch pattern set), `hasChunkLoadErrorSignature()`, `isChunkLoadError()`, `notifyChunkLoadError()`, `CHUNK_LOAD_ERROR_EVENT`, `APP_BOOTED_FLAG`. Generic runtime errors never enter this path. The boot script is the ONE allowed inline pattern copy; keep it in sync. |
| Router fallback | `lib/diagnostics/globalErrorCapture.ts` | Next's exact “Failed to fetch RSC payload … Falling back to browser navigation” console event stays in the browser console but never persists as `system_error`; the full-document fallback is the recovery. Similar application fetch failures remain red. |
| Overlay chunks | `features/overlays/boundary/lazyOverlay.tsx` | Per-overlay boundary + hung-import timeout; reload there is a user-clicked last-resort button only. |
| Auth landing | `components/auth/HardRedirectForm.tsx` | Password login/signup success lands via **full-document navigation** (`window.location.assign`), never a soft server-action `redirect()`. A stale /login tab's old runtime otherwise soft-navigates and 404s on the destination's chunks — /welcome (the universal first landing) was the top victim. Auth actions return `{ hardRedirect }` on success; error paths keep `redirect()`. |

## Invariants

- **No `window.location.reload()` on any automatic path** post-boot. New recovery code screams (toast/boundary prompt), it never acts.
- The boot script is dependency-free inline JS — it must never import a chunk.
- `/api/version` is `force-dynamic`, `no-store`, and returns `deploymentId: null` off-Vercel → watcher polling disabled locally (the `matrx:chunk-load-error` listener still works).
- **Never infer deployment skew from an error signature or successful refresh.** Only a deployment-ID mismatch may claim that a new version exists; recovery UI for load failures states only the observed failure.
- Toast copy is the Supabase pattern: one sentence, **Refresh** + **Not now**, `duration: Infinity`, deduped by toast id.
- **Visible Sonner toast cards restore `pointer-events: auto`.** Modal drawers disable body hit-testing; without this override, a toast paints above the sheet while taps pass through it.

## Every error on screen carries the Alchemy Menu (RC-B12, 2026-09-25)

Arman: an error must be copyable for AI with everything needed to act on it. One payload builder, inherited by every error render:

| Render | File | How it gets the menu |
|---|---|---|
| Inline error card / one-line field error | `ErrorNotice.tsx` (`size`: `default`, `compact`, `inline`) | built in |
| Red alert box | `components/ui/alert.tsx` (`variant="destructive"`) | automatic; text read from the rendered alert at the click |
| Route crash screen | `ErrorBoundaryView.tsx` (every `error.tsx` delegates here) | built in (replaced the old bespoke Copy-for-AI button) |
| Section crash fallback | `lib/error-boundary/ErrorBoundaryWithCapture.tsx` | default fallback |
| Error toasts | `lib/toast.ts` decorator registered by `components/ui/sonner.tsx`; legacy `components/ui/toaster.tsx` destructive toasts | automatic; a caller's own action is never displaced |

- **Payload** — `error-alchemy.ts` `buildErrorAlchemyPayload`: the sentence shown, code/status/name/details/hint/stack, operation, records, unsaved input, and the surface with its DECLARED values (`useErrorSurfaceSnapshot.ts`: nearest `AlchemySurfaceBridge`, else the active page surface; secret/non-exportable values never leave; an unregistered page says so). Variant "Error with fix request" wraps it in an instruction.
- **Guard** — `__tests__/error-renders-carry-alchemy.test.ts`: shrink-only census (`error-render-census.baseline.json`) of hand-drawn `role="alert"` boxes and "Something went wrong" sentences. A new one fails; a fixed one must lower its entry. Move a render onto `ErrorNotice` (`size="inline"` for `<p role="alert" className="text-destructive">`), or put `<ErrorAlchemyMenu />` (no props needed) inside the existing box. The baseline is empty and stays empty.

## Change Log

- 2026-09-26 — RC-B12 census at zero: `ErrorAlchemyMenu` with no `input` reads the words of the `role="alert"` box it sits in, and every bespoke error box in `app/ components/ features/ lib/` carries it (108 files by insertion + public error pages by hand). The guard now ignores comments, warning-styled notices and fallback strings, and counts renders beyond the file's menu carriers. NOT covered: error boxes rendered inside `@ai-matrx/*` packages (design-system data table, org picker, associations) — they need the menu in the package.

- 2026-09-25 — RC-B12: the Alchemy Menu on every error render (table above); six bespoke core `error.tsx` delegate to `ErrorBoundaryView`; 75 files of one-line field errors moved onto `ErrorNotice size="inline"`; census 297 → 183 renders, guarded shrink-only.

- 2026-09-11 — `refresh_required` off the platform client-directive channel becomes the third prompt path (`refresh-directive.ts`); same toast, same never-on-its-own law; works without a deployment id (local too).

- 2026-09-02 — Route boundaries mirror their already structured render capture to DevTools without producing a duplicate durable `console-error` row.
- 2026-08-27 — Excluded Next's exact successful RSC-to-document navigation fallback from durable error capture while retaining nearby application fetch failures.
- 2026-08-26 — Nested Markdown boundaries route explicit lazy-renderer chunk failures to `NewVersionWatcher` instead of misclassifying them as Markdown render defects.
- 2026-08-23 — Removed the false “page is out of date” diagnosis. Turbopack’s generic `module factory is not available` runtime failure can occur on fresh loads; it is no longer classified or suppressed as deploy skew, while explicit chunk failures use cause-neutral recovery copy. Detection, pre-boot handling, overlays, boundaries, and regression tests now share that contract.
- 2026-08-22 — Centralized explicit chunk-fetch signatures in `CHUNK_LOAD_ERROR_PATTERNS` for route and overlay boundaries. A generic Turbopack runtime-integrity message was temporarily included and was removed on 2026-08-23 because it did not prove deploy skew.
- 2026-08-20 — Restored hit-testing on visible Sonner toast cards so **Refresh** and **Not now** remain tappable above modal mobile drawers.
- 2026-08-15 — Root boot scripts use tracked `next/script` `beforeInteractive` entries instead of raw React `<script>` children, preserving pre-hydration recovery without triggering React 19.2 hydration recovery.
- 2026-07-29 — Stale `/login` tabs soft-navigated after sign-in and 404'd on `/welcome` chunks. Added `HardRedirectForm` so auth success lands via full-document navigation; deleted dead `sign-up/Basic.tsx` + `AlternativeSignUp.tsx`.
- 2026-07-10 — Killed all post-boot auto-reloads (boot script, `ErrorBoundaryView`, `global-error`); added `NewVersionWatcher` + `/api/version` consent toast; boot script now disarms after boot via `__MATRX_APP_BOOTED__`.
