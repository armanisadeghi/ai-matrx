# Media Capture — FEATURE.md

**Status:** Under construction (P0 scaffold + Phase 2 pure core + Phase 3 camera runtime + Phase 5 photo capture/Capture Studio/scanner migration shipped). Execution plan: [docs/media-capture-plan.md](../../docs/media-capture-plan.md). Cross-repo system of record: `/Users/armanisadeghi/code/common-docs/media-capture/FEATURE.md` (metadata schema v1, TUS wire contract, server contracts) — read it before touching any cross-repo boundary.

One platform capture system for **photos, video, and audio** from browser media devices, on desktop and mobile.

## Core-storage contract

Exactly one byte store, no capture-specific record store:

| Store | Holds | Single access path |
|---|---|---|
| `files.files` (universal handler) | ALL captured bytes (photo/video/audio) + `metadata.capture` | `upload/capture-uploader.ts` → `fileHandler.upload` |

- Rows land under `CloudFolders.CAPTURES_PHOTOS/VIDEOS/AUDIO`. Persist `file_id`, never URLs. Render via `<InlineMediaRef>`.
- Output `width`/`height`/`duration_ms` live in canonical `files.files` columns (server probe). `metadata.capture` is the snake_case discriminated union v1 defined in the common-docs system of record — never persist device IDs, group IDs, or hardware labels.
- Inventing a capture table or a second byte path is the named failure class.

## Layout

```
features/media-capture/
  core/       capture-types (+ buildPhotoCaptureMetadata) · geometry (sourceRect) · constraints · mime-selection   [pure, unit-tested — LIVE]
  runtime/    camera-stream-manager (the ONE getUserMedia({video}) site)   [LIVE]
  recording/  media-recorder-controller · video-recorder · chunk-journal   [Phase 7]
  upload/     capture-uploader (validate → CloudFolders.CAPTURES_* → fileHandler.upload)   [LIVE]
  hooks/      usePhotoCapture (capturePhotoFromVideo canvas core + hook)   [LIVE]
  components/ CameraPreview · CaptureStudio · CaptureControls · CaptureReview · DeviceFallbackInput · CameraPage   [LIVE]
```

Routes: `app/(core)/camera/` (LIVE — SSR auth gate, `createRouteMetadata` letter "Ca", skeleton loading; body via `<PageHeader>` + `h-full overflow-hidden bg-textured`; Capture Studio + recent-captures lens over the existing cloud-files tree/`useFolderContents`, rendered via `<InlineMediaRef>` — no second query stack). Admin-gated `/camera/admin` is Phase 8. Dev harness: `/demos/media-capture` (real primitives — profiles, mount/unmount leak check, diagnostics readout). Devices layer: `features/media-devices/` (shared with audio). Recording shares `features/audio/captureLock.ts`, `micStream.ts`, and the audio session registry.

**Production consumer:** the PDF scanner's `features/pdf/scanner/components/CaptureView.tsx` runs on this runtime (environment facing, `maximum-available`, full-frame canvas capture at q0.92, per-shot Blob; native takePhoto disabled there — WYSIWYG requires output dims === stream `videoWidth×videoHeight`).

## Invariants

The 13 enforced invariants live in [docs/media-capture-plan.md](../../docs/media-capture-plan.md) §5 and are normative here. Highlights: one gUM(video) site; captureLock before any MediaRecorder (takeover = discard); mic only via micStream clones; camera stops on last lease release, never prompts at boot; intrinsic dims never from element offsets; `canvas.toBlob` only (no base64); tracked object URLs revoked on every terminal path; emitted Blob MIME is authoritative; one video file per capture.

## Phase 2 — pure capture core (live)

`core/` is pure TS, zero DOM side effects, unit-tested (`pnpm jest features/media-capture/core`):

- `capture-types.ts` — metadata union v1 + `FramingMode` / `CaptureQualityProfile` / capture state + terminal `CaptureErrorKind`s; `isCaptureMetadata` strict validator (rejects unknown/camelCase keys and any deviceId/groupId/label at any depth).
- `geometry.ts` — `sourceRect(...)`: identity for full-frame; exact object-cover crop for viewport-crop; throws on degenerate dims. Header documents the three-sizes separation rule.
- `constraints.ts` — `buildVideoConstraints` (profiles; maximum-available over-asks ideal 4096, no aspectRatio), `summarizeTrackState` (requested/capability/effective, no device identifiers), `isCompatibleQualityChange` (reacquire only on deviceId/facingMode change).
- `mime-selection.ts` — concrete-string recording ladders (`selectRecordingMime`, null = browser default) + `extensionForMime` (audio types delegate to `features/audio/utils/audio-mime.ts` — never fork that map).

## Phase 3 — camera runtime (live)

`runtime/camera-stream-manager.ts` — framework-free singleton, the ONE legal `getUserMedia({video})` call site (ESLint `cameraGetUserMediaChokepointBan` in `eslint.config.mjs` enforces; legal exceptions carry an inline justified disable). The mic twin of `features/audio/micStream.ts`, minus keepalive:

- `acquireCameraLease({deviceId?, facingMode?, profile})` → ref-counted `CameraLease` (`id`, live `stream` getter, `getTrackSummary()` requested/capability/effective via `summarizeTrackState`, `on("reconfigured")`, `release()`).
- **Compatibility policy:** equal deviceId+facingMode+profile share the stream. Incompatible acquire: no pin → reacquire at the new spec, stop old tracks, fire `"reconfigured"` to every holder with the new stream; pinned → reject with typed `CameraBusyError` (carries `pinOwner`). Never a silent wrong-spec stream.
- `pinForRecording(leaseId, ownerLabel)` / `unpin()` — pin blocks incompatible acquires; releasing the pinned lease auto-unpins.
- **Camera stops IMMEDIATELY on last release** — no keepalive, no boot prompt.
- Preferred device via injected `setPreferredCameraResolver` (Phase 4 wires Redux; applied next-acquire, caller spec wins).
- Interruptions: `subscribeCameraInterruption` (`ended|muted|unmuted|permission-revoked`); `pagehide` leak scream + hard stop; `notifyCameraPermissionRevoked()` for the device layer.
- Permission: real gUM outcomes → `noteCameraPermissionOutcome` (denial only for NotAllowedError/SecurityError); `installCameraPermissionAcquirer()` registers the label-unlock acquirer with the device manager — explicit install by the provider layer, never an import side effect.
- `getCameraStreamState()` / `subscribeCameraStream` — referentially stable snapshots (`useSyncExternalStore`-safe); `cameraStreamDebug()`.

`components/CameraPreview.tsx` — the canonical live `<video>` for a lease's stream: `framing` `full-frame` (object-contain) / `viewport-crop` (object-cover), always via inline styles (the global mobile `img,video,iframe{height:auto}` rule beats Tailwind — the legacy `camera-view.tsx` workaround, replicated + cited); `mirror` is a preview-only CSS transform; intrinsic dims (`videoWidth/videoHeight`, never element offsets) reported via `onIntrinsicSize` on loadedmetadata/resize/orientationchange; muted + autoplay + playsInline. Renders only — never acquires/releases leases.

## Change log

- 2026-07-21 — Phase 3: camera runtime (`runtime/camera-stream-manager.ts` lease/pin/reconfigure singleton + `components/CameraPreview.tsx` + ESLint gUM(video) chokepoint + 11 unit tests); type-check green.

- 2026-07-21 — Phase 2: `core/` (types, geometry, constraints, mime-selection) + 44 unit tests landed; type-check green.

- 2026-07-21 — P0 scaffold: contract + invariants pointer created; plan + common-docs system of record ratified.
