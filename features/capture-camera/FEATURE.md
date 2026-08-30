# Capture Camera — FEATURE.md

**Status:** SHIPPED as **`@ai-matrx/capture` 0.5.0 on npm** — the package (`aidream/apps/shared/capture`) is the SINGLE source of truth for the chrome; the staged copies here were deleted on the swap (no-legacy). This directory now holds ONLY the app glue: `host/` + this doc. Live at `/commerce/intake/v2` (+ `/v2/instant`), `/commerce/intake/v3` (+ `/v3/instant`), and `/tools/product-capture` (+ `/instant` — the product-capture `CaptureScreen`, swapped 2026-08-30); real-phone acceptance pass pending. Chrome changes go in the aidream package (bump + tag `npm/capture/vX.Y.Z` + `pnpm sync:matrx-packages` here), never in this repo. Package classes reach Tailwind via the `@source` line for `@ai-matrx/capture/dist` in `app/globals.css`.

The opinionated iPhone-style camera chrome: full-bleed feed under semi-transparent near-black bars, two-tap options grid, honest zoom pills, shutter, VIDEO·PHOTO·UPLOAD mode row, iOS-style sheets, instant in-browser crop/rotate editing.

## The three laws

- 🚨 **THE CLOUD LAW: cloud integration is WHAT this system does, never an option.** `CameraCapture` requires `cloud: CaptureCloudPort` (recents thumb → tiled cloud library, save-edited persistence). The host injects HOW, never WHETHER. Enforced by the package `laws.test.ts` (a `cloud?:` is a test failure).
- 🚨 **The engine is injected HERE — this app has a runtime.** Since 0.5.0 the package ships a production default engine (`useDefaultCaptureEngine`, `src/engine/` — permission pre-check, combined prompt, warm-mic with the four iOS branches, flip, clock) for runtime-less hosts; THIS app instead adapts the ONE camera runtime (`features/media-capture`) via `host/useCameraCaptureHost.ts`, which per C22 injects identity only and imports the package's quirk helpers (`cropBlobToAspect`, `classifyCameraBlockReason`, `nextCameraDevice`) instead of carrying twins.
- **Honest capabilities only.** Torch/zoom/exposure render ONLY when `MediaTrackCapabilities` reports them (`hooks/useTrackControls.ts`). Never a fake toggle. Aspect (full/4:3/1:1/16:9) is a REAL center-crop of the full-sensor frame (the package's `cropBlobToAspect`).

## Layout

```
@ai-matrx/capture           the chrome + engine (npm): CameraCapture(V3) · ShutterButton · ModeSelector ·
                            ZoomRow · OptionsGridPanel · CaptureSheet · ImageEditSheet · GridOverlay ·
                            CountdownOverlay · useTrackControls · CloudLibrarySheet (tiled gallery over
                            injected CaptureCloudLibraryItem[]) · useDefaultCaptureEngine + warm-mic +
                            permission/crop/flip helpers · the ports/slots types (root entry, RSC-safe)
host/                       APP-SIDE injection wiring ONLY (C22): useCameraCaptureHost (lease runtime →
                            engine port; each kept block carries its justification) · CloudLibrarySheet
                            (Redux files + MediaThumbnail + router → the PACKAGE sheet; same props)
```

**Deterministic browser QA uses the host adapter, never decoder injection.**
`useCameraCaptureHost` accepts development-only `qaPermissionDenied` and
`qaImageUrl`; the image becomes a real canvas-backed `MediaStream`. Production
callers never pass either value.

## Extensibility — typed slots, not a plugin framework

Domain features attach via `CaptureCameraSlots`: `topBarCenter/Trailing`, `statusChips` (survive hide-controls), `aboveModeSelector`, `modeRowTrailing`, `optionTiles` (extra grid tiles), `extraModes` (mode-row entries such as SCAN — immediate actions), `overlays`. **Worked example:** `features/commerce-intake/components/IntakeCaptureScreenV2.tsx` (QR mode, serial entry, notes, voice, Next/Break, instant Process — all slots, zero chrome forks).

## Roadmap (ratified direction, not built)

- **Scanner unification:** the PDF scanner (`features/pdf/scanner`) already runs on the same camera runtime — it becomes a SCAN entry via `slots.extraModes`; never a second chrome.
- **Runtime extraction:** `features/media-capture` core/runtime/recording move into the package in a later major; the app engine adapter shrinks to config.
- **AI editing actions:** server-side image edits ride injected edit-sheet actions (image-studio APIs), never a second editor.
- Edit for persisted-only slides (fileId → blob fetch) — today Edit shows only when local pixels (`previewUrl`) exist.

## Change Log

- 2026-08-30 — **C22/C23 retrofit: the hard parts moved INTO the package (capture 0.5.0) and the host collapsed to injection wiring.** `useCameraCaptureHost` now imports the package's `cropBlobToAspect` / `classifyCameraBlockReason` / `nextCameraDevice` / `PHOTO_JPEG_QUALITY` (local twins deleted) and every kept block carries its C22 justification (lease lifecycle, device persistence, app mic-singleton warm hold, canonical capture/record paths, toasts). The 206-line `CloudLibrarySheet` chrome moved to the package; the host copy is now a 110-line data wrapper (Redux files → `CaptureCloudLibraryItem[]`, `MediaThumbnail`, router push) with unchanged props, so intake v2/v3 did not move. Host `host/` total: 621 → 528 lines, none of it chrome or quirk branches. Package side: warm-mic manager with the four iOS branches ported verbatim, production default engine, laws amended (see aidream `apps/shared/capture/FEATURE.md`).

- 2026-08-30 — Added development-only denied-camera and image-stream inputs to the shared host adapter for isolated-browser acceptance.

- 2026-08-30 — **C9 host adoption: product-capture swapped.** `features/product-capture/components/CaptureScreen.tsx` rebuilt on `CameraCapture` + `useCameraCaptureHost` (second production consumer of the host adapter after commerce intake; its cloud port opens the product Items sheet as the library). Remaining hand-built chrome: commerce-intake v1 only — gated on Arman's v2-vs-v3 approval (`features/commerce-intake/FEATURE.md`); `features/media-capture/components/CaptureModeBar.tsx` dies with that swap.

- 2026-08-29 — **Published + swapped.** `@ai-matrx/capture` 0.1.0 published via the tag workflow (Arman had pre-reserved the name at 0.0.0); matrx-frontend consumes it as `latest`; staged `components/`/`hooks/`/`types.ts` DELETED; `@source` line added to globals.css.
- 2026-08-29 — Created: chrome + laws + edit sheet + host adapter + cloud library; commerce v2 rebuilt on it at `/commerce/intake/v2`; package mirrored to `aidream/apps/shared/capture` (typecheck/test/check:package green, unpublished).
