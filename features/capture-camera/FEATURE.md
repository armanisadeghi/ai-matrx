# Capture Camera — FEATURE.md

**Status:** SHIPPED as **`@ai-matrx/capture` 0.1.0 on npm** — the package (`aidream/apps/shared/capture`) is the SINGLE source of truth for the chrome; the staged copies here were deleted on the swap (no-legacy). This directory now holds ONLY the app glue: `host/` + this doc. Live at `/commerce/intake/v2` (+ `/v2/instant`); real-phone acceptance pass pending. Chrome changes go in the aidream package (bump + tag `npm/capture/vX.Y.Z` + `pnpm sync:matrx-packages` here), never in this repo. Package classes reach Tailwind via the `@source` line for `@ai-matrx/capture/dist` in `app/globals.css`.

The opinionated iPhone-style camera chrome: full-bleed feed under semi-transparent near-black bars, two-tap options grid, honest zoom pills, shutter, VIDEO·PHOTO·UPLOAD mode row, iOS-style sheets, instant in-browser crop/rotate editing.

## The three laws

- 🚨 **THE CLOUD LAW: cloud integration is WHAT this system does, never an option.** `CameraCapture` requires `cloud: CaptureCloudPort` (recents thumb → tiled cloud library, save-edited persistence). The host injects HOW, never WHETHER. Enforced by the package `laws.test.ts` (a `cloud?:` is a test failure).
- 🚨 **The engine is injected — no getUserMedia here.** The host adapts the ONE camera runtime (`features/media-capture`) via `host/useCameraCaptureHost.ts`; the chrome renders and orchestrates UI state only. No network, no storage (laws test).
- **Honest capabilities only.** Torch/zoom/exposure render ONLY when `MediaTrackCapabilities` reports them (`hooks/useTrackControls.ts`). Never a fake toggle. Aspect (full/4:3/1:1/16:9) is a REAL center-crop of the full-sensor frame, applied host-side (`cropBlobToAspect`).

## Layout

```
@ai-matrx/capture           the chrome (npm): CameraCapture · ShutterButton · ModeSelector · ZoomRow ·
                            OptionsGridPanel (two-tap grid) · CaptureSheet (iOS sheet, content+busy) ·
                            ImageEditSheet (crop/rotate/flip) · GridOverlay · CountdownOverlay ·
                            useTrackControls · the ports/slots types (root entry, RSC-safe)
host/                       APP-SIDE: useCameraCaptureHost (lease/photo/video via media-capture runtime,
                            aspect crop) · CloudLibrarySheet (tiled cloud gallery over the files layer;
                            tiles open /files/f/[id])
```

## Extensibility — typed slots, not a plugin framework

Domain features attach via `CaptureCameraSlots`: `topBarCenter/Trailing`, `statusChips` (survive hide-controls), `aboveModeSelector`, `modeRowTrailing`, `optionTiles` (extra grid tiles), `extraModes` (mode-row entries such as SCAN — immediate actions), `overlays`. **Worked example:** `features/commerce-intake/components/IntakeCaptureScreenV2.tsx` (QR mode, serial entry, notes, voice, Next/Break, instant Process — all slots, zero chrome forks).

## Roadmap (ratified direction, not built)

- **Scanner unification:** the PDF scanner (`features/pdf/scanner`) already runs on the same camera runtime — it becomes a SCAN entry via `slots.extraModes`; never a second chrome.
- **Runtime extraction:** `features/media-capture` core/runtime/recording move into the package in a later major; the app engine adapter shrinks to config.
- **AI editing actions:** server-side image edits ride injected edit-sheet actions (image-studio APIs), never a second editor.
- Edit for persisted-only slides (fileId → blob fetch) — today Edit shows only when local pixels (`previewUrl`) exist.

## Change Log

- 2026-08-29 — **Published + swapped.** `@ai-matrx/capture` 0.1.0 published via the tag workflow (Arman had pre-reserved the name at 0.0.0); matrx-frontend consumes it as `latest`; staged `components/`/`hooks/`/`types.ts` DELETED; `@source` line added to globals.css.
- 2026-08-29 — Created: chrome + laws + edit sheet + host adapter + cloud library; commerce v2 rebuilt on it at `/commerce/intake/v2`; package mirrored to `aidream/apps/shared/capture` (typecheck/test/check:package green, unpublished).
