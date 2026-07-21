# Media Capture — FEATURE.md

**Status:** Built (P0 scaffold + Phases 2/3/4/5/7/8 shipped; TUS live E2E pending server deploy). Execution plan: [docs/media-capture-plan.md](../../docs/media-capture-plan.md). Cross-repo system of record: `/Users/armanisadeghi/code/common-docs/media-capture/FEATURE.md` (metadata schema v1, TUS wire contract, server contracts) — read it before touching any cross-repo boundary.

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
  runtime/    camera-stream-manager (the ONE getUserMedia({video}) site) · mediaCaptureDiagnostics (aggregating registry)   [LIVE]
  recording/  media-recorder-controller · video-recorder · chunk-journal · journal-recovery (the ONE assemble+save flow)   [LIVE]
  upload/     capture-uploader (validate → CloudFolders.CAPTURES_* → fileHandler.upload; failures → diagnostics ring w/ retry payload)   [LIVE]
  hooks/      usePhotoCapture · useCaptureUploadFeed (Redux→diagnostics upload feed host)   [LIVE]
  components/ CameraPreview · CaptureStudio · CaptureControls · CaptureReview · DeviceFallbackInput · CameraPage ·
              CaptureLibrary · CameraControlTab · CameraAdminDiagnostics   [LIVE]
```

Routes: `app/(core)/camera/` (LIVE — SSR auth gate, `createRouteMetadata` letter "Ca", skeleton loading; body via `<PageHeader>` + `h-full overflow-hidden bg-textured`; Capture Studio + the full `CaptureLibrary` management lens over the existing cloud-files tree/`useFolderContents` — no second query stack) and admin-gated `/camera/admin` (LIVE — `<FeatureAdminPage>` map + read-only `CameraAdminDiagnostics`; never acquires a camera). Dev harness: `/demos/media-capture` (real primitives — profiles, mount/unmount leak check, diagnostics readout). Devices layer: `features/media-devices/` (shared with audio). Recording shares `features/audio/captureLock.ts`, `micStream.ts`, and the audio session registry.

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

## Phase 5 — photo capture + Capture Studio + scanner migration (live)

- `hooks/usePhotoCapture.ts` — **canvas primary everywhere**: `sourceRect(...)` region of the SOURCE frame drawn to a canvas sized to the SOURCE crop (never element offsets), `canvas.toBlob("image/jpeg", q)` → `capture-<ISO>.jpg` File. `ImageCapture.takePhoto()` is a feature-detected enhancement, opt-in (`allowNativeTakePhoto`) and full-frame ONLY, with canvas fallback on any error — viewport-crop and the scanner's WYSIWYG path never use it. Core (`capturePhotoFromVideo`) is DI'd (canvas factory) and geometry-tested.
- `components/DeviceFallbackInput.tsx` — `<input type="file" accept="image/*" capture>` normalized to the same contract (`source: "capture-input"`): EXIF orientation applied + metadata stripped via `createImageBitmap({imageOrientation:"from-image"})` → canvas re-encode; oversized images (>24 MP) downscale to the pixel budget instead of OOMing.
- `upload/capture-uploader.ts` — validates with `isCaptureMetadata` BEFORE upload (throws loudly on unknown keys / hardware identifiers), folder from `CloudFolders.CAPTURES_PHOTOS/VIDEOS/AUDIO` (added to `features/files/utils/folder-conventions.ts`, private by rule), bytes via `fileHandler.upload` only; a resolve without `fileId` is an upload failure.
- `components/CaptureStudio/CaptureControls/CaptureReview` — preview (viewport-crop default, full-frame toggle, front-camera mirror preview-only) → shutter → review (retake / download / save). Tracked object URLs revoked on retake/replace/unmount and on the save-swap to `<InlineMediaRef>` by file_id. Terminal `CaptureError` kinds surfaced: `permission-denied`, `device-removed`, `stream-ended`, `not-supported` (added to the kind union); permission/not-supported offer the OS-camera fallback. Facing flip on mobile, device select (deviceManager cameras) on desktop.
- **Scanner migrated** onto the runtime and **legacy deleted**: `components/matrx/camera/` (5 files) + `app/(dev)/demos/tests/camera-test/` are gone — no shims. Scanner details in `features/pdf/FEATURE.md` (2026-07-21 entry).
- Tests: `npx jest features/media-capture --no-coverage` (geometry integration + uploader contract + prior core/runtime suites).

## Phase 7 — recording + chunk journal + TUS client (live; TUS E2E pending)

`recording/` is framework-free (no React/Redux):

- `media-recorder-controller.ts` — THE canonical MediaRecorder state machine for video AND audio (locked decision 5; `useSimpleRecorder` runs on it — no second MIME/lifecycle machine anywhere). Constructor-confirmed ladder fallthrough over `recordingMimeCandidates` (all-fail → typed `UnsupportedCodecError` + `unsupported-codec` terminal); `recorder.mimeType` and the emitted-Blob MIME are authoritative (`getAuthoritativeMime`); start/pause/resume/stop/cancel with EXACTLY ONE terminal event per controller; pause-aware monotonic elapsed via `performance.now()` (never chunk arrival); timeslice `onChunk(blob, sequence)`; max-duration + estimated-size (emitted bytes + bitrate extrapolation) hard stops with distinct terminal reasons.
- `chunk-journal.ts` — crash-safety IndexedDB `mtx-capture-journal`: `chunks` keyed `[capture_id, sequence]` (stored as raw bytes + MIME), `manifests` keyed `capture_id` (status recording/finalized/discarded, mime, emitted_bytes, created/expires, last_sequence, source_feature, has_audio). `navigator.storage.estimate()` preflight rejects a start under `JOURNAL_MIN_FREE_BYTES` (typed `StorageQuotaError` → `storage-quota` terminal). Retention 48h (`purgeExpired`). **Recovery semantics (invariant 11):** durability is promised ONLY for emitted chunks; `finalized` = whole, `recording` = interrupted partial; `readChunks` reports `missingSequences` LOUDLY; the studio phrases recovery as "Recovered N of M segment(s)", never as whole. The TUS resume-URL store is a SEPARATE DB (`mtx-tus-urls`) — never merge them.
- `video-recorder.ts` — orchestrators `startVideoRecording` (pinned lease + optional mic clone) and `startAudioRecording` (same engine — NOT a parallel recorder). Mic discipline on EVERY exit path (stop/cancel/takeover/track-end/pagehide/start-failure): `acquireMicStream()` ONCE → clone the track → stop ONLY the clone → `releaseMicStream()` exactly once (double-release guarded; unit-tested with spies). `claimCapture({id: MEDIA_CAPTURE_LOCK_ID})` before the recorder; **takeover = discard** (journal dropped, no partial blob ever delivered). Registers `beginRecordingSession({source: "media-capture"})` (new `AudioSessionSource` member). Environment exits (camera/mic `ended`, permission-revoked, `pagehide`) stop-and-PRESERVE the journal; the final Blob is always assembled FROM the journal (single source of truth), result `{blob, mime (authoritative), durationMs, hasAudio, partial}`.

Studio: `CaptureStudio` has a photo/video/audio mode switch (`CaptureControls`), record/pause/resume/stop/cancel with the controller-fed elapsed timer, mic on/off for video, and a recovery banner on open (`listRecoverable()` → Finish & save / Discard, loud partial phrasing). Review (`CaptureReview`) plays video/audio through `useOutputSinkRef` and joins the audio system via `useMediaElementPlaybackSession`. Metadata via `buildVideoCaptureMetadata` / `buildAudioCaptureMetadata` (`core/capture-types.ts`) — `recorder_mime_type` is the FINAL Blob MIME, `source_settings` from the lease's `getTrackSummary().effective`; saved through `capture-uploader` into `Captures/Videos|Audio`.

**Transport:** large captures upload via the TUS client in the file handler — policy + status in [features/files/handler/FEATURE.md](../files/handler/FEATURE.md) § Transport policy. **Live browser E2E against the deployed server is PENDING** (the aidream TUS wire fixes exist locally, undeployed) — the client is unit-tested against an injected HttpStack only; do not claim live verification until a real browser upload passes.

Tests: `npx jest features/media-capture --no-coverage` (controller ladder/elapsed/caps, journal append/finalize/recovery/expiry/quota, mic-release exit paths, plus prior suites).

## Phase 8 — management surfaces + Media control window (live)

- **`runtime/mediaCaptureDiagnostics.ts`** — framework-free AGGREGATING registry (audioSessionRegistry discipline: lazy wiring, referentially stable snapshot, subscribe, `__reset`): camera stream state (subscribed), captureLock owner, media-capture recording sessions (filtered from the audio registry), capture upload/transport state (FED via `feedUploadState` from the `useCaptureUploadFeed` client host — the registry never imports Redux), on-demand journal summaries (`refreshCaptureJournals`), and a bounded recent-failure ring (`recordCaptureFailure`, MAX 50) with retry payloads (File + metadata) in a side table (`getCaptureRetryPayload` / `dismissCaptureFailure`). It owns nothing — never a second source of truth.
- **Failure wiring:** `capture-uploader` records every terminal upload failure WITH a retry payload (the one cloud chokepoint); the studio records camera-acquire and recording terminal errors; `journal-recovery` records recovery failures. Retry = surfaces re-invoke `uploadCapture` from the payload, then dismiss the entry.
- **`recording/journal-recovery.ts`** — `finishJournalRecovery(entry)` is THE assemble+save flow (read chunks → metadata → `uploadCapture` → discard journal, journal preserved on failure). The studio banner AND the /camera library both run it — never fork a second recovery.
- **`/camera` (full list page)** — `components/CaptureLibrary.tsx`: kind filter chips (All/Photos/Videos/Audio; `metadata.capture.artifact_kind` authoritative, mime tiebreak) over all three `Captures/*` folders via the EXISTING files layer; upload-state chips (in-flight from the cloudFiles slice, failed with Retry from the diagnostics ring, TUS resume-pending count via `listStoredTusUploads`); Recovery section (shared flow); tiles open `/files/f/[fileId]` and carry the canonical `FileRightClickMenu` (rename/move/share/download/delete — nothing reimplemented).
- **Media control window** — `AudioControlWindow` retitled **"Media"** (overlayId `audioControlWindow`, window/component ids, and openers UNCHANGED — zero breakage); desktop tabs Playback / Recording / **Camera** / Devices, mobile stacked sections. Camera tab = `components/CameraControlTab.tsx` (read-only diagnostics: leases/spec, pin + lock owners, live sessions, transport summary, recoverable-journal count → /camera). Avatar-menu entry: label "Media", icon `MonitorSpeaker`. Registry/catalogue labels updated.
- **`/camera/admin`** — `app/(core)/camera/admin/page.tsx`: `<FeatureAdminPage>` (admin-gated, `routeScanPath: "app/(core)/camera"`) listing routes/panel/components/demo/docs/related features, plus `CameraAdminDiagnostics` (client, read-only): supported recording MIMEs (`recordingMimeCandidates` × `MediaRecorder.isTypeSupported`), permission states + device counts (labels only when already granted; never persisted), applied spec, lease/pin/lock owners, transport + TUS sessions, journals, failure ring. **Opening it never acquires a camera or prompts.** Add every new capture route/panel/component to this map.
- `@/features/files` public surface gained `selectVisibleUploads` / `selectAllFoldersArray` / `listStoredTusUploads` (read-only observability exports) for the feed + chips.

## Change log

- 2026-07-21 — Phase 8: `mediaCaptureDiagnostics` registry (+6 unit tests) with failure ring/retry payloads wired into uploader/studio/recovery, shared `journal-recovery` flow (studio refactored onto it), `/camera` full management lens (`CaptureLibrary`: filters, upload chips + retry, TUS resume indicator, recovery, canonical file menu), Media control window (title "Media", Camera tab, avatar-menu label/icon), `/camera/admin` FeatureAdminPage map + read-only diagnostics; type-check/doctrine/page-headers green.
- 2026-07-21 — Phase 7: recording stack (`recording/` controller + chunk journal + video/audio orchestrators), `useSimpleRecorder` refactored onto the controller, studio video/audio modes + recovery banner, `buildVideoCaptureMetadata`/`buildAudioCaptureMetadata`, TUS transport in the file handler (80 MB policy; live E2E pending server deploy); 25 new unit tests; type-check green.
- 2026-07-21 — Phase 5: photo capture (`usePhotoCapture`), `DeviceFallbackInput`, `capture-uploader` + `CloudFolders.CAPTURES_*`, Capture Studio (studio/controls/review), `/camera` route (SSR gate + metadata "Ca" + skeleton), `/demos/media-capture` harness, scanner `CaptureView` migration (Blob contract, tracked URLs), legacy `components/matrx/camera` + camera-test demo deleted; 11 new unit tests; type-check/page-headers green.
- 2026-07-21 — Phase 4: preferences + unified settings landed (`userPreferences.mediaDevices` module + paired TS/SQL backfill, provider-wired preferred-camera resolver + permission acquirer, `MediaDevicesPanel` camera section with opt-in preview, `devices` settings tab); type-check + sanitizer tests green.
- 2026-07-21 — Phase 3: camera runtime (`runtime/camera-stream-manager.ts` lease/pin/reconfigure singleton + `components/CameraPreview.tsx` + ESLint gUM(video) chokepoint + 11 unit tests); type-check green.

- 2026-07-21 — Phase 2: `core/` (types, geometry, constraints, mime-selection) + 44 unit tests landed; type-check green.

- 2026-07-21 — P0 scaffold: contract + invariants pointer created; plan + common-docs system of record ratified.
