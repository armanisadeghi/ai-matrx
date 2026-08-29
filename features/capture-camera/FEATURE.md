# Capture Camera — FEATURE.md

**Status:** Built; live at `/commerce/intake/v2` (+ `/v2/instant`) as the isolated rebuild of the intake camera; real-phone acceptance pass pending. **This directory is the EXTRACTION SOURCE for `@ai-matrx/capture`** (`/Users/armanisadeghi/code/aidream/apps/shared/capture` — gates green, unpublished pending the one-time npm trusted-publisher bootstrap). Mirror rule: `components/`, `hooks/`, `types.ts` stay app-import-free (React, lucide-react, `cn` only — the documented substitution points); **`host/` never ships** — it is the app glue.

The opinionated iPhone-style camera chrome: full-bleed feed under semi-transparent near-black bars, two-tap options grid, honest zoom pills, shutter, VIDEO·PHOTO·UPLOAD mode row, iOS-style sheets, instant in-browser crop/rotate editing.

## The three laws

- 🚨 **THE CLOUD LAW: cloud integration is WHAT this system does, never an option.** `CameraCapture` requires `cloud: CaptureCloudPort` (recents thumb → tiled cloud library, save-edited persistence). The host injects HOW, never WHETHER. Enforced by the package `laws.test.ts` (a `cloud?:` is a test failure).
- 🚨 **The engine is injected — no getUserMedia here.** The host adapts the ONE camera runtime (`features/media-capture`) via `host/useCameraCaptureHost.ts`; the chrome renders and orchestrates UI state only. No network, no storage (laws test).
- **Honest capabilities only.** Torch/zoom/exposure render ONLY when `MediaTrackCapabilities` reports them (`hooks/useTrackControls.ts`). Never a fake toggle. Aspect (full/4:3/1:1/16:9) is a REAL center-crop of the full-sensor frame, applied host-side (`cropBlobToAspect`).

## Layout

```
types.ts                    ports + slots (CaptureCameraEngine, CaptureCloudPort, CaptureCameraSlots)
components/                 CameraCapture (assembly) · ShutterButton · ModeSelector · ZoomRow ·
                            OptionsGridPanel (two-tap grid) · CaptureSheet (iOS sheet, content+busy) ·
                            ImageEditSheet (crop/rotate/flip) · GridOverlay · CountdownOverlay
hooks/useTrackControls.ts   torch/zoom/exposure over track capabilities
host/                       APP-SIDE: useCameraCaptureHost (lease/photo/video via media-capture runtime) ·
                            CloudLibrarySheet (tiled cloud gallery over the files layer; tiles open /files/f/[id])
```

## Extensibility — typed slots, not a plugin framework

Domain features attach via `CaptureCameraSlots`: `topBarCenter/Trailing`, `statusChips` (survive hide-controls), `aboveModeSelector`, `modeRowTrailing`, `optionTiles` (extra grid tiles), `extraModes` (mode-row entries such as SCAN — immediate actions), `overlays`. **Worked example:** `features/commerce-intake/components/IntakeCaptureScreenV2.tsx` (QR mode, serial entry, notes, voice, Next/Break, instant Process — all slots, zero chrome forks).

## Roadmap (ratified direction, not built)

- **Scanner unification:** the PDF scanner (`features/pdf/scanner`) already runs on the same camera runtime — it becomes a SCAN entry via `slots.extraModes`; never a second chrome.
- **Runtime extraction:** `features/media-capture` core/runtime/recording move into the package in a later major; the app engine adapter shrinks to config.
- **AI editing actions:** server-side image edits ride injected edit-sheet actions (image-studio APIs), never a second editor.
- Edit for persisted-only slides (fileId → blob fetch) — today Edit shows only when local pixels (`previewUrl`) exist.

## Change Log

- 2026-08-29 — Created: chrome + laws + edit sheet + host adapter + cloud library; commerce v2 rebuilt on it at `/commerce/intake/v2`; package mirrored to `aidream/apps/shared/capture` (typecheck/test/check:package green, unpublished).
