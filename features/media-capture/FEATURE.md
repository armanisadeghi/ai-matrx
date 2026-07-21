# Media Capture — FEATURE.md

**Status:** Under construction (P0 scaffold). Execution plan: [docs/media-capture-plan.md](../../docs/media-capture-plan.md). Cross-repo system of record: `/Users/armanisadeghi/code/common-docs/media-capture/FEATURE.md` (metadata schema v1, TUS wire contract, server contracts) — read it before touching any cross-repo boundary.

One platform capture system for **photos, video, and audio** from browser media devices, on desktop and mobile.

## Core-storage contract

Exactly one byte store, no capture-specific record store:

| Store | Holds | Single access path |
|---|---|---|
| `files.files` (universal handler) | ALL captured bytes (photo/video/audio) + `metadata.capture` | `upload/capture-uploader.ts` → `fileHandler.upload` |

- Rows land under `CloudFolders.CAPTURES_PHOTOS/VIDEOS/AUDIO`. Persist `file_id`, never URLs. Render via `<InlineMediaRef>`.
- Output `width`/`height`/`duration_ms` live in canonical `files.files` columns (server probe). `metadata.capture` is the snake_case discriminated union v1 defined in the common-docs system of record — never persist device IDs, group IDs, or hardware labels.
- Inventing a capture table or a second byte path is the named failure class.

## Layout (target)

```
features/media-capture/
  core/       capture-types · geometry (sourceRect) · constraints · mime-selection   [pure, unit-tested]
  runtime/    camera-stream-manager (the ONE getUserMedia({video}) site)
  recording/  media-recorder-controller · video-recorder · chunk-journal
  upload/     capture-uploader
  hooks/      usePhotoCapture · ...
  components/ CameraPreview · CaptureStudio · CaptureControls · CaptureReview · DeviceFallbackInput
```

Routes: `app/(core)/camera/` (+ admin-gated `/camera/admin`). Devices layer: `features/media-devices/` (shared with audio). Recording shares `features/audio/captureLock.ts`, `micStream.ts`, and the audio session registry.

## Invariants

The 13 enforced invariants live in [docs/media-capture-plan.md](../../docs/media-capture-plan.md) §5 and are normative here. Highlights: one gUM(video) site; captureLock before any MediaRecorder (takeover = discard); mic only via micStream clones; camera stops on last lease release, never prompts at boot; intrinsic dims never from element offsets; `canvas.toBlob` only (no base64); tracked object URLs revoked on every terminal path; emitted Blob MIME is authoritative; one video file per capture.

## Change log

- 2026-07-21 — P0 scaffold: contract + invariants pointer created; plan + common-docs system of record ratified.
