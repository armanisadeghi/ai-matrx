# Media Capture System — Execution Plan

**Status:** Final — ready for execution.
**Date:** 2026-07-21
**Scope:** One platform-grade capture system for **photos, video, and audio** — camera/mic/speaker device management unified in settings, correct sizing, cloud-file integration, full management surfaces — on desktop and mobile browsers.
**System of record for cross-repo contracts:** `/Users/armanisadeghi/code/common-docs/systems/media-capture/FEATURE.md` (metadata schema, TUS browser-wire contract, bounded-media-processing requirements, transcription and derivative contracts, ownership map). This document is the frontend execution plan; server work is owned by the aidream handoffs listed in Phase 6/9.

---

## 1. Foundation (verified 2026-07-21)

### Frontend primitives to build on (reuse, never fork)

| Primitive | Location | Role for capture |
|---|---|---|
| Capture lock (ONE live capture app-wide, start-always-wins) | `features/audio/captureLock.ts` | Any recorder claims `claimCapture` before opening a MediaRecorder; takeover = discard |
| Shared mic singleton (the only legal `getUserMedia({audio})`) | `features/audio/micStream.ts` | Video-with-audio clones the shared mic track; never independent audio gUM, never `track.stop()` on the source |
| Audio session registry | `features/audio/session/audioSessionRegistry.ts` | Recording sessions register via `beginRecordingSession`; feeds the Media control window |
| Device manager (mic+speaker) | `features/audio/audioDevices.ts` | id+label persistence, `resolveDeviceId` (id→label→default), Chromium `permissions.query` / Safari-infer split, `devicechange`, referentially stable snapshots. Moves to `features/media-devices/` in Phase 1 |
| Output sink store | `features/audio/audioOutputSink.ts` + `useOutputSinkRef` | Review playback routes through the selected speaker (`setSinkId` feature-detected; Safari no-ops) |
| Device preferences | `userPreferences.audioDevices` module, `lib/redux/preferences/userPreferencesSlice.ts` | Flat id+label pairs, `""` = system default, synced tier. Superseded by `mediaDevices` in Phase 4 |
| Devices UI panel | `features/audio/components/devices/AudioDevicesPanel.tsx` | Mic/speaker selects, permission row, live meter, speaker test — gains a camera section (control-window variant) |
| Audio control window | `features/window-panels/windows/AudioControlWindow.tsx`, overlayId `"audioControlWindow"`, openers in `features/overlays/openers/audioControlWindow.tsx` | Expands into the Media control window under the same overlayId |
| Universal file handler | `features/files/handler/handler.ts` — `fileHandler.upload({kind:"blob"\|"file"}, opts)` | The ONLY cloud boundary. `UploadOpts.metadata` flows verbatim into `files.files.metadata` JSONB; no new `FileSource` variant needed |
| Object-URL registry | `lib/media/object-url-registry.ts` | All local preview URLs via `createTrackedObjectUrl`; revoked explicitly on every terminal path |
| Durable rendering | `<InlineMediaRef>` + `lib/media/{signed-url,durability}.ts` | Persist `file_id`, never signed URLs; renders re-mint on failure |
| File actions / mutations | `features/files/hooks/useFileMutation.ts`, `useSharing.ts`, `FileContextMenu`, `FilePreview` | The `/camera` list page reuses these wholesale |
| Folder conventions | `features/files/utils/folder-conventions.ts` (`CloudFolders`) | Add `CAPTURES_PHOTOS/VIDEOS/AUDIO` constants; never hand-roll paths |
| Preference backfill machinery | `sanitizeLoadedPreferences()` in `userPreferencesSlice.ts`, `users.normalize_preferences_jsonb`, `users.heal_user_preferences_drift()`, `lib/integrity/checks.ts` | Every persisted preference shape change ships a paired backfill through this machinery |
| Crash-safety stores | `features/audio/services/audioSafetyStore.ts`, `audioChunkJournal.ts` | Behavior reference only. The array-in-one-record design is not suitable for large video; Phase 7 builds a chunk-per-record journal |
| DB columns | `files.files`: `parent_file_id`, `derivation_kind`, `width`, `height`, `duration_ms`, `metadata` JSONB, `visibility`, soft delete | No new capture table |
| Legacy camera engine | `components/matrx/camera/` (5 files) | Exactly two consumers: the dev demo and the PDF scanner's `CaptureView`. Replaced and deleted in Phase 5 |

### Server state (aidream / `packages/matrx-files`)

- Probing and derivatives exist (image/video/audio dimensions and duration, video `poster_url`, audio waveform PNG; ffmpeg via imageio-ffmpeg; OpenCV; pydub) — but `thumbnails.py::generate_thumbnail_for_file` reads the **entire object into memory** (`router.read_async` before probe/render), has no temp-file/streaming path and no concurrent-analysis guard. Not approved for large captured video until Phase 6 lands.
- TUS engine and host routes exist (`aidream/api/routers/files_tus.py` → `/files/upload/tus`, `TUSSessionManager`, `files.uploads_inflight`, 5 GB transport cap) — but the **browser wire is not operational**: CORS `allow_headers`/`expose_headers` in `aidream/app_config.py` contain no TUS headers and do not expose `Location`/`Upload-Offset`/`X-Cld-File-Id`; `creation-with-upload` is advertised but the POST body is ignored; `HEAD` returns 404 for completed sessions (no lost-final-response recovery); `Upload-Metadata` is flat strings stored verbatim (no nested `metadata.capture` parity with buffered uploads). Phase 6 is the gate.
- The 5 GB TUS value is a transport cap, not an end-to-end supported size, until bounded processing is measured.
- Transcription: `/audio/transcribe` (multipart, reads the whole upload into memory) and `/audio/transcribe-url` (whitelisted URL) only. STT rejects files above the provider limit (Groq default 100 MB) and requires the caller to chunk. Transcription from a managed file reference is a bounded-media-processing feature (Phase 9).
- No audio-demux capability and no audio/video derivation kinds exist. The enum lives at `packages/matrx-files/matrx_files/derivations.py`; enum↔DB-check-constraint lockstep is enforced by `packages/matrx-files/tests/test_derivations.py` against `cloud_sync/sql/018_file_derivation_kind_vocabulary.sql`.
- The standalone matrx-files service (`files.matrxserver.com`, hot standby) mounts no TUS router; the HTTP router is host-coupled in aidream. Parity is required before any traffic cutover (Phase 9).

### Browser facts the implementation obeys

- Photos are **canvas-first everywhere** (preview-exact crops, EXIF-free output). `ImageCapture.takePhoto()` is a feature-detected enhancement wherever callable — including Safari 18.4+.
- MP4/H.264 recording support varies by browser, version, and OS encoder. The recording format is chosen at runtime from a ladder of **concrete codec strings** via `MediaRecorder.isTypeSupported()`, then confirmed by constructing and starting the recorder with fallthrough. `isTypeSupported()` is a hint, not a guarantee; the MIME observed on emitted/final Blob data is authoritative for the stored file.
- Device labels are blank until a permission grant. iOS Safari regenerates deviceIds per page load — device identity is persisted as id+label pairs and resolved id → label → system default.
- Chromium `permissions.query({name:"camera"|"microphone"})` is trusted and subscribed; Safari's is not — permission state is inferred from the real `getUserMedia` outcome.
- `devicechange` is not uniformly available; re-enumeration also runs after permission grants and explicit refreshes.
- `setSinkId` is feature-detected; Safari no-ops.
- `dataavailable` timing is unreliable under tab suspension and screen lock; elapsed time comes from `performance.now()`, never chunk arrival, and durability is only ever promised for chunks the browser actually emitted.
- An `ideal` resolution constraint never guarantees the physical sensor maximum. Capabilities come from `getCapabilities()` where available; the recorded truth is `getSettings()` / `videoWidth`×`videoHeight`.

### The PDF scanner contract (production consumer that must not break)

`features/pdf/scanner/components/CaptureView.tsx` requires:

- `facingMode: { ideal: "environment" }` and a high-resolution preference (`width/height ideal 4096`, no aspectRatio) — a stream-selection preference, not a sensor guarantee.
- **Full-stream WYSIWYG**: capture the complete selected stream frame, matching an `object-contain` letterboxed preview — including the inline-style workaround for the global mobile CSS rule `img, video, iframe { height: auto }` (`camera-view.tsx` L50–60).
- Per-shot capture at JPEG quality 0.92 (migrating from data URLs to Blob + tracked object URL in Phase 5).
- `switchCamera` / `numberOfCameras`, `notSupported` / `permissionDenied` states, and the `<input type="file" accept="image/*" capture="environment">` OS-camera fallback for blocked webviews.

---

## 2. Architecture

```
Settings tab "Camera, microphone & speakers" ─┐
Media control window (overlayId audioControlWindow) ─┤→ shared device controller/hooks
Capture Studio ───────────────────────────────┘         │
                                                        ▼
                              features/media-devices (device core)
                              micStream.ts · captureLock.ts · audioSessionRegistry
                                                        │
        features/media-capture  ◄───────────────────────┘
        core (types·geometry·constraints·mime) / runtime (camera stream manager)
        recording (recorder controller · video recorder · chunk journal)
        hooks / components (Capture Studio)
                                                        │ Blob/File + metadata.capture
                                                        ▼
        fileHandler.upload  ──(small: buffered multipart)──►  aidream /files/upload
                            ──(large: TUS client)──────────►  aidream /files/upload/tus
                                                        │
                                          files.files rows (Captures/Photos·Videos·Audio)
                                          probe: width/height/duration · poster · waveform
                                                        │
        /camera list page · <InlineMediaRef> · file actions · /camera/admin
```

### Locked decisions

1. **Device ownership:** a neutral `features/media-devices/` owns the generalized device manager — enumeration for mic/speaker/camera, permission state for both mic and camera, `devicechange`, `resolveDeviceId`, referentially stable snapshots. It is built by **moving and generalizing** `features/audio/audioDevices.ts` (device type renamed to the generic `MediaDeviceDescriptor`; camera permission watcher added). `features/audio` keeps thin compatibility re-exports only for the bounded import migration, deleted within the same phase group. One enumerator, one `devicechange` listener — never parallel audio/camera managers.
2. **No new DB table.** `files.files` + `metadata.capture` + folder conventions cover ownership, lifecycle, dimensions, duration, thumbnails, lineage, and sharing.
3. **Feature home:** `features/media-capture/`; route family `app/(core)/camera/` (list-view entry page per the feature-entry doctrine; admin-gated `/camera/admin` FeatureAdminMap).
4. **Capture metadata** is a versioned, snake_case **discriminated union** (schema below, frozen in the common-docs system of record). Output `width`/`height`/`duration_ms` live in canonical `files.files` columns and are not duplicated in JSON. The emitted/final Blob MIME is the authoritative output type.
5. **One canonical low-level MediaRecorder controller** shared by video and audio. The existing `useSimpleRecorder` is refactored onto it — no second MIME/lifecycle/crash-recovery state machine.
6. **Chunk journal** is chunk-per-record IndexedDB keyed `(capture_id, sequence)` with a manifest, quota preflight, retention/expiry, and idempotent finalization. The audio safety store is a behavior reference, not code to generalize.
7. **Settings composition:** the Settings tab and the control-window panel share non-visual controller/hooks. `MediaDevicesSettingsTab` is built exclusively from official Settings primitives + `useSetting` (new official media-preview/meter primitives are added if needed); mobile renders stacked sections. The control-window `MediaDevicesPanel` remains a window component.

### Capture metadata schema (v1)

```ts
type CaptureMetadataBase = {
  version: 1;
  captured_at: string; // ISO
  source: "browser-media-devices" | "capture-input" | "import";
  source_feature: string; // "camera" | "pdf-scanner" | ...
};

type VisualSourceSettings = {
  width: number;
  height: number;
  frame_rate: number | null;
  facing_mode: "user" | "environment" | null;
};

type CaptureMetadata =
  | (CaptureMetadataBase & {
      artifact_kind: "photo";
      source_settings: VisualSourceSettings;
      framing: "full-frame" | "viewport-crop";
      mirrored_output: boolean;
    })
  | (CaptureMetadataBase & {
      artifact_kind: "video";
      source_settings: VisualSourceSettings;
      framing: "full-frame" | "viewport-crop";
      mirrored_output: boolean;
      has_audio: boolean;
      recorder_mime_type: string; // actual emitted/final Blob MIME
    })
  | (CaptureMetadataBase & {
      artifact_kind: "audio";
      recorder_mime_type: string; // actual emitted/final Blob MIME
    });

metadata.capture = captureMetadata;

// NEVER persisted: deviceId, groupId, device labels (hardware-identifying).
```

---

## 3. Phases

Every phase ends green: `pnpm type-check`, `pnpm check:doctrine`, plus the phase-relevant checks — run, not assumed. Each phase lists exact test routes.

### Phase 0 — System of record + contracts (single owner, everything forks after it)

**Build:**
1. `common-docs/systems/media-capture/FEATURE.md` — the cross-repo system of record: metadata schema v1, TUS browser-wire contract, bounded-media-processing requirements, transcription-source contract, `audio_extracted` derivative contract, ownership map.
2. `features/media-capture/FEATURE.md` skeleton — status, core-storage contract (bytes → `files.files` via `fileHandler`, no third store), invariants, pointer to common-docs.
3. Three aidream work-order handoffs filed in `aidream/docs/handoffs/` (contents = Phase 6 and Phase 9 server scopes, with file:line evidence).

**Accept:** docs exist, no code. Pointer lines only — no mirrored content between repos.

### Phase 1 — Device core: `features/media-devices/`

**Build:**
1. Move `features/audio/audioDevices.ts` → `features/media-devices/deviceManager.ts` and generalize:
   - `MediaDeviceDescriptor` (`{deviceId, label, groupId}`) replaces the audio-specific type name.
   - Snapshot gains `cameras: MediaDeviceDescriptor[]` and `cameraPermissionState`.
   - Camera permission: `permissions.query({name:"camera"})` on Chromium with subscription; Safari inferred from the last camera `getUserMedia` result (mirroring the mic split).
   - `ensureCameraPermission()` is exported here but delegates stream acquisition to the camera stream manager (Phase 3) — no throwaway `getUserMedia`. Until Phase 3 lands it is not called by any UI. **Never prompt for camera at app boot.**
   - `resolveDeviceId` reused for cameras; the single `devicechange` listener reused; referentially stable snapshots preserved (`useSyncExternalStore` requirement).
2. Compatibility re-exports in `features/audio/audioDevices.ts` for the bounded import migration; every importer flipped; re-exports deleted before Phase 4 completes.
3. Unit tests: `resolveDeviceId`, `captureLock` claim/takeover/release, snapshot stability, camera permission state machine.
4. Fix the two stale claims in `features/audio/FEATURE.md` (the global AudioContext `setSinkId` monkeypatch is deleted — routing lives in `useOutputSinkRef` + `SinkAwarePlayer`; test coverage stated honestly).
5. Remove the dead `react-media-recorder` dependency.

**Test:** `pnpm type-check`; new unit tests pass; avatar menu → Audio → Devices unchanged; no camera permission prompt anywhere.

### Phase 2 — Pure capture core: `features/media-capture/core/` (no dependencies; runs parallel to Phase 1)

**Build** — pure TS, no DOM side effects, fully unit-tested:
- `capture-types.ts` — the metadata union and capture state contracts.
- `geometry.ts` — `sourceRect(containerW, containerH, videoW, videoH, framing)` mapping a cover-cropped preview back to source pixels; identity for `full-frame`. The three sizes are always separate: preview container size (layout, `ResizeObserver`), stream intrinsic size (`video.videoWidth/videoHeight` — never element offsets), persisted output size (capture canvas / track settings). Tests: letterbox, pillarbox, DPR independence, rotation swap.
- `constraints.ts` — builds `MediaTrackConstraints` from preference + quality profile; models requested vs capability vs effective settings separately; `applyConstraints()` for compatible quality changes, reacquire only on device/facingMode change.
- `mime-selection.ts` — recording-format ladder of **concrete** codec strings:
  1. `video/mp4;codecs=avc1.42000a,mp4a.40.2` → `video/mp4;codecs=avc1.42000a,opus` → `video/mp4`
  2. `video/webm;codecs=vp9,opus`
  3. `video/webm;codecs=vp8,opus`
  4. `video/webm` → browser default
  `isTypeSupported()` filters candidates; the constructor + `start()` confirm with fallthrough; all-fail is a loud terminal error. The emitted/final Blob MIME determines the stored type and file extension; the requested MIME is diagnostics only. Audio-only uses the same controller with an analogous concrete ladder (`audio/mp4`, `audio/webm;codecs=opus`, browser default), sharing/extending `utils/audio-mime.ts`.
- Quality profiles: `maximum-available` (capability-informed), `1080p` (default), `720p` (data saver). Requested, capability, and effective settings recorded separately.

**Test:** unit tests only — no UI in this phase.

### Phase 3 — Camera runtime

**Build:**
- `runtime/camera-stream-manager.ts` — the ONE legal `getUserMedia({video})` call site (mirror of `micStream.ts`): ref-counted leases; preferred device from preferences applied on next acquire; **camera stops immediately when the last lease closes** (no keepalive); track-health watchers (`ended`/`mute`), interruption channel, `pagehide` leak scream. Every lease declares device/facing and quality requirements; compatible leases share a stream; an incompatible request follows a documented preempt/reacquire-or-busy policy and never silently receives the wrong stream. Recording **pins** the device + effective settings; switching or incompatible acquisition during recording is blocked with a visible explanation.
- ESLint restriction banning `getUserMedia({video})` outside the manager (mirroring the mic rule).
- `components/CameraPreview.tsx` — `full-frame` (object-contain letterbox with the inline-style guard against the global mobile `height:auto` CSS rule) and `viewport-crop` (object-cover) modes; front-camera mirror is preview-only (CSS transform), output unmirrored unless requested; intrinsic dims re-read on resize/orientation.
- Unit tests: lease compatibility, preemption/busy, last-release shutdown, track end, pinned recording.

**Test:** `/demos` harness page not yet required; unit tests + a temporary dev-only mount verifying acquire/release and the no-leak scream.

### Phase 4 — Preferences + unified settings

**Build:**
1. New `userPreferences.mediaDevices` module (flat, house style):
   ```ts
   interface MediaDevicePreferences {
     audioInputDeviceId: string;  audioInputDeviceLabel: string;
     audioOutputDeviceId: string; audioOutputDeviceLabel: string;
     videoInputDeviceId: string;  videoInputDeviceLabel: string;
     preferredFacingMode: "user" | "environment" | "";   // "" = auto
   }
   ```
   Absorbs `audioDevices` field-for-field; `videoConference.defaultCamera` is dropped (placeholder enum, no mapping).
2. Paired backfill — same change, non-negotiable:
   - TS: rule in `sanitizeLoadedPreferences()` — lift `audioDevices` → `mediaDevices`, drop `videoConference.defaultCamera`, loud warn.
   - SQL: new rule **added** to `users.normalize_preferences_jsonb` (frozen rules never edited) in a new migration; `users.heal_user_preferences_drift()` covers it; applied live via Supabase MCP + `_schema_migrations` ledger upsert + `pnpm db-types`.
   - Integrity: extend `user-preferences-legacy-drift` in `lib/integrity/checks.ts`; verify drift = 0 at `/administration/data-integrity`.
3. All consumers flipped (`useAudioDevices.ts`, provider, panel, selectors); old preference module deleted; no compat reads beyond the sanitizer; Phase 1 re-exports deleted.
4. Control-window `MediaDevicesPanel` (extends the `AudioDevicesPanel` lineage): camera select (real enumeration), independent camera-permission row + Grant button (through `ensureCameraPermission` → stream manager), **opt-in** live preview tile (explicit button, never auto-starts), effective resolution/frame-rate readout while a stream runs. Mic meter + speaker test unchanged. Consumes the shared controller/hooks.
5. `MediaDevicesSettingsTab` ("Camera, microphone & speakers"): registry entry `devices` in `features/settings/registry.ts`, `persistence: "synced"`; composed only from official Settings primitives + `useSetting`; new official media-preview/meter primitives added first if needed; desktop may group, mobile renders stacked sections; deep-link aliases added where the registry's routing contract requires.
6. `VideoConferenceTab`: fake camera selector removed; meeting prefs kept; link chip to the devices tab.

**Test routes:** avatar menu → Audio → Devices (mic/speaker unchanged, camera picker present); Settings → "Camera, microphone & speakers"; Settings → Video conference; `/administration/data-integrity` (drift = 0). Saved camera survives reload and deviceId churn (label fallback). Settings tab contains no raw shadcn imports; mobile stacks sections.

### Phase 5 — Photo capture + Capture Studio + scanner migration

**Build:**
- `hooks/usePhotoCapture.ts` — canvas primary: draw `sourceRect(...)` → `canvas.toBlob("image/jpeg", q)` (base64/data URLs banned); `ImageCapture.takePhoto()` as feature-detected enhancement with canvas fallback; correct `File` naming.
- `components/DeviceFallbackInput.tsx` — `<input type="file" accept="image/*" capture>` OS-camera path normalized into the same output contract, tagged `source: "capture-input"`. Imported photos get EXIF orientation applied + GPS/EXIF stripped before the sanitized master is committed or shared (client-side canvas re-encode; bounded-memory/server fallback for oversized images).
- `upload/capture-uploader.ts` — builds `metadata.capture`, resolves folders via new `CloudFolders.CAPTURES_PHOTOS/VIDEOS/AUDIO` (+ descriptions + visibility rule), calls `fileHandler.upload`. Review previews via `createTrackedObjectUrl`, **revoked on retake, removal, replacement, and unmount**; on save, swap to `<InlineMediaRef>` by `file_id`.
- `components/CaptureStudio.tsx` + `CaptureControls` + `CaptureReview` — photo mode: preview → shutter → review (retake / download / save) → durable ref. Explicit terminal errors: permission denied, device removed, stream ended, not supported.
- `app/(core)/camera/` scaffold per core-route rules: `page.tsx` (SSR auth gate) + `layout.tsx` (`createRouteMetadata`, unique letter) + `loading.tsx`; body `h-full overflow-hidden`; chrome via `<PageHeader>`; mobile per ios-mobile-first. Includes a minimal recent-captures lens through the existing files data layer so the save acceptance test is real (Phase 8 expands it).
- Scanner migration: `CaptureView.tsx` onto the new runtime — full-frame framing, environment facing, `maximum-available`, per-shot Blob at q=0.92 (scanner internals move from data URLs to Blobs + tracked object URLs), fallback input preserved. WYSIWYG pixel check: captured frame dimensions equal the selected stream's `videoWidth×videoHeight`; letterboxed preview visually matches output.
- Delete `components/matrx/camera/` (all five files) and `app/(dev)/demos/tests/camera-test/` after repo-wide import verification — no shims, no re-exports.
- New dev harness `app/(dev)/demos/media-capture/page.dev.tsx` exercising the production primitives (framing modes, quality profiles, device switching, error states).

**Test routes:** `/camera` (photo capture → review → save → appears through the files data layer with output dimensions in `files.files`, renders via InlineMediaRef, lands in `Captures/Photos`, thumbnail arrives); deny-permission and no-camera states; mobile front/rear switch with preview-only mirror; incompatible concurrent lease behavior; zero object URLs/tracks after retake and unmount; `/tools/scanner` (mobile + desktop, save to PDF extractor unchanged); `/demos/media-capture`.

### Phase 6 — Server gate (aidream; starts at Phase 0, must land before the Phase 7 TUS client)

Owned by the aidream handoff `docs/handoffs/` (TUS browser wire + bounded media processing). Scope:

1. CORS in `aidream/app_config.py`: `allow_headers` gains `Tus-Resumable`, `Upload-Length`, `Upload-Metadata`, `Upload-Offset` (plus content type, idempotency, authorization already present); `expose_headers` gains `Location`, `Upload-Offset`, `Upload-Length`, `Tus-Resumable`, `Tus-Version`, `Tus-Extension`, `Tus-Max-Size`, `X-Cld-File-Id`. Real browser-preflight integration tests.
2. `files_tus.py`: implement `creation-with-upload` (consume the POST body) or remove it from `Tus-Extension` — the advertised set must be true.
3. Completed-session recovery: `HEAD`/status for a finalized session returns final offset/length and the authorized `file_id` (or an authenticated finalization lookup) so a lost final PATCH response never forces a duplicate upload.
4. Metadata parity: one validated base64 `metadata_json` key inside `Upload-Metadata`, parsed and merged server-side so buffered and TUS writes produce the same nested `metadata.capture`; malformed/forbidden metadata rejected loudly.
5. Bounded large-media processing: `generate_thumbnail_for_file` and probing move to temp-file/streaming (ffprobe/ffmpeg/OpenCV by path) with a bounded memory ceiling; concurrent-analysis dedup; define which generic analyses are skipped for camera video; measure a realistically large file before advertising any end-to-end maximum.

**Accept:** browser TUS integration test passes from an actual browser origin (preflight, upload, resume, lost-final-response recovery, metadata parity); memory ceiling measured and recorded in common-docs.

### Phase 7 — Recording + chunk journal + TUS client

**Build:**
1. `recording/media-recorder-controller.ts` — the one canonical MediaRecorder state machine (video + audio): concrete-MIME fallback, emitted-MIME authority, start/pause/resume/stop/cancel, monotonic elapsed time (`performance.now()`), timeslice emission, limit enforcement, terminal error semantics. `useSimpleRecorder` refactored onto it.
2. `recording/video-recorder.ts` — composes a pinned camera track + optional cloned shared-mic track. Acquire the shared mic once and hold the ref for the full recording; clone its audio track into the composed stream; stop **only the clone**; `releaseMicStream()` exactly once on every success/error/cancel/takeover path. Claims `captureLock` (`media-capture-recording`; takeover = discard, never auto-deliver a partial blob); registers via `beginRecordingSession` (adding a `media-capture` session source if the registry contract needs it); handles `track.ended`/`mute`/`unmute`, visibility, pagehide, device removal; enforces max duration and estimated size before and during capture.
3. `recording/chunk-journal.ts` — chunk-per-record IndexedDB keyed `(capture_id, sequence)` + a manifest (status, MIME, emitted byte count, created/expiry, last durable sequence). Quota preflight via `navigator.storage.estimate()`; retention/cleanup; idempotent finalization; quota and partial-recovery surfaced explicitly. Durability is promised only for emitted chunks; incomplete recovery reports loudly. Audio migrates onto it only after parity tests.
4. Audio-only studio mode through the canonical controller, saved via the same uploader into `Captures/Audio`.
5. Review playback: `<video>`/`<audio>` routed through `useOutputSinkRef`, registered as a playback session.
6. TUS client in `fileHandler` (gated on Phase 6): `tus-js-client`; explicit transport policy across buffered/presigned/TUS; `UploadOpts` gains `signal?: AbortSignal` and a transport override; named size threshold (starting value 80 MB, tunable on evidence); explicit chunk size within server bounds (8–32 MiB); progress/retry/cancel; `X-Idempotency-Key`; fresh Authorization per request; final `X-Cld-File-Id` captured; custom IndexedDB `UrlStorage` kept separate from the recorder-chunk journal; server session expiry surfaced. Fix the `features/files/index.ts` transport comment only when all advertised transports work.

**Test routes:** `/camera` studio — video with mic (one file, `has_audio: true`, emitted `recorder_mime_type` persisted, duration + poster server-side); video without mic; audio-only (waveform thumbnail); pause/resume; cancel; mic acquire/clone/release balanced on every exit path; lock takeover from a live transcript recording is loud; large recording uploads via TUS from the browser (preflight, progress, token refresh, interruption + reload resume, lost-final-response recovery, expiry, metadata parity, cancellation); tab-background/phone-lock produce durable emitted chunks and an explicit partial-recovery offer.

### Phase 8 — Management surfaces + Media control window

**Build:**
1. `/camera` list page — a lens over the existing files query/data layer (no second query stack, no ad hoc `.from()` calls): `Captures/` + validated `metadata.capture` filter; photo/video/audio filters; upload-state chips + failed-upload retry (from the `cloudFiles` slice + TUS journal); existing viewer and file actions; optional `"captures"` `CloudFilesSection` so `/files` gains the same lens.
2. Media control window: same overlayId `"audioControlWindow"` and openers, title "Media"; desktop tabs Playback / Recording / Camera / Devices; mobile stacked sections. Camera tab shows active leases, recording-lock owner, live capture state; Devices tab is the control-window `MediaDevicesPanel`. Avatar-menu label/icon updated.
3. `mediaCaptureDiagnostics` — a bounded, framework-free registry (referentially stable snapshots + subscription) owning active leases, effective settings, lock/session state, transport state, journal summaries, and a bounded recent-failure ring. Components consume it; Redux mirroring only if non-React consumers require it.
4. `/camera/admin` — admin-gated (`requireAdmin`) `FeatureAdminPage` (`routeScanPath: "app/(core)/camera"`) listing routes, panels, overlays, components, slices, demo route, plus read-only diagnostics from the registry (supported APIs/codecs, permission states, detected devices, applied settings, lease/lock owners, transport state, recoverable journals, recent failures). Opening the page never prompts for or acquires a camera.

**Test routes:** `/camera` (filters, actions, failed-upload recovery), `/camera/admin`, avatar menu → Media (all four tabs, mobile stacked), `/files` still green.

### Phase 9 — Server integrations finish (aidream)

Owned by the aidream handoffs. Scope:

1. **Transcription from a managed reference:** the request contract evolves to a discriminated source (or `source: MediaRef`) while multipart/URL callers keep working. Authorization resolves through the file access gate. For video/large audio: stream to a bounded temp file, demux/normalize to a provider-supported audio container, split under the provider limit, transcribe chunks, assemble ordered timestamped segments. The whole source is never loaded into memory, and the client never mints a signed URL just to hand it back to the same server. FE: "Transcribe" action on captured video/audio sends the managed reference.
2. **`audio_extracted` derivative:** `FileDerivationKind.audio_extracted` + the check-constraint migration in the owning `cloud_sync/sql` ledger (enum↔constraint lockstep test enforced); output codec/container specified (stream-copy when compatible, otherwise normalized); bounded temp-file processing + cleanup; inherited owner/org/visibility/scope; managed write with `parent_file_id`; idempotency; exposed from the package router with host/standalone parity. FE: explicit "Extract audio" action; lineage visible in the viewer.
3. **Standalone TUS parity:** the hardened HTTP router becomes a `packages/matrx-files` factory with injected host dependencies, mounted in standalone; identical protocol/CORS/metadata/finalization behavior verified in both surfaces before any traffic cutover.

**Also:** wire the server `exif_strip` op into an import preset for capture-input/imported photos as a server-side backstop; regenerate backend models and run `pnpm sync-types` after every server/DB contract change.

---

## 4. Parallelization map (fleet lanes)

| Lane | Work | Depends on |
|---|---|---|
| Lane 0 | Phase 0 (system of record, contracts, handoffs) | — (runs first, single owner) |
| Lane 1 — FE devices | Phase 1 → Phase 3 → Phase 4 | Phase 0 |
| Lane 2 — FE pure core | Phase 2 | Phase 0 (starts immediately, no code deps) |
| Lane 3 — Server | Phase 6 → Phase 9 | Phase 0 (starts immediately in aidream) |
| Lane 4 — FE capture | Phase 5 (after 2+3) → Phase 7 (TUS branch after 6) → Phase 8 | Lanes 1–3 as noted |

---

## 5. Invariants (enforced)

1. One `getUserMedia({video})` call site — the camera stream manager. ESLint restriction mirrors the mic rule.
2. One live capture app-wide — `captureLock` claimed before any MediaRecorder; takeover = discard.
3. Mic access only via `micStream` — clone tracks for recording; never stop the shared track; never independent `getUserMedia({audio:true})`.
4. Camera stops when the last lease closes. No keepalive. No boot-time camera prompt, ever. Lease compatibility/preemption is explicit; recording pins device and effective settings.
5. Intrinsic dimensions from `videoWidth/videoHeight` / track settings — never element offsets. Preview size, stream size, output size never conflated.
6. `canvas.toBlob()` and Blob/File everywhere — base64/data URLs banned in the capture pipeline.
7. Bytes go through `fileHandler.upload` only; previews through the object-URL registry with explicit revoke on every terminal path; renders through `<InlineMediaRef>`; persist `file_id`, never signed URLs; no `/api/camera/*` Next.js routes; no capture-specific cloud storage.
8. No device IDs, group IDs, or hardware labels in persisted file metadata.
9. One video file per video capture — audio duplication only as an explicit server-side derivative with lineage.
10. Every terminal error explicit and user-visible: permission denied, device removed, stream ended, unsupported codec, storage quota, upload failure, mic conflict, lock takeover.
11. Every recovery path screams: partial chunk recovery, URL re-mint, upload resume/final-response recovery. Recovery is never promised for recorder data that was never emitted.
12. Capture metadata is the validated snake_case discriminated union; output dimensions/duration remain canonical row columns; the emitted/final Blob MIME is authoritative.
13. Large-media processing is bounded-memory. A transport limit is never advertised as an end-to-end product limit without measured processing tests.

## 6. Release gates

- `pnpm type-check`, `pnpm check:doctrine`, `pnpm check:page-headers`, `pnpm check:migrations`, `pnpm check:release-gates` — run, not assumed.
- Browser matrix: Chrome/Edge/Firefox/Safari desktop; Safari iOS + Chrome Android on real devices — simulated streams do not count as verification.
- Scenario matrix: front/rear/external/unplugged cameras; rotation during preview AND recording; full-frame (scanner) vs viewport-crop pixel comparisons; camera-only / video-only / video+mic; permission combinations (camera granted + mic denied, etc.); compatible and incompatible leases; exact mic acquire/clone/release balance; lock contention with a live transcript recording; tab background, phone lock, track interruption, route unmount mid-recording; large TUS upload with forced interruption + resume + lost final response + token refresh + expiry; buffered↔TUS metadata parity; measured server memory ceiling on a realistically large file; cloud metadata/poster/dimensions/duration/waveform/permissions verified in the live DB; extracted-audio lineage; managed-reference transcription with a source larger than one provider request.
- Hygiene: zero leaked object URLs, live tracks, IndexedDB chunks, or lock claims after unmount (admin diagnostics prove it); no signed URLs persisted anywhere; legacy camera fully deleted; `react-media-recorder` gone.
- Docs: `common-docs/systems/media-capture/FEATURE.md` current; repo feature docs point to it; aidream handoffs groomed per the handoff system; `features/audio/FEATURE.md` corrections landed; `features/files/handler/FEATURE.md` documents the transport policy; `/camera/admin` map complete.

## 7. Key references

- Frontend: `features/audio/{captureLock,micStream,audioOutputSink}.ts`, `features/audio/session/audioSessionRegistry.ts`, `features/audio/components/devices/AudioDevicesPanel.tsx`, `features/files/handler/{handler,upload,types}.ts`, `features/files/utils/folder-conventions.ts`, `lib/media/{object-url-registry,signed-url,durability}.ts`, `features/pdf/scanner/components/CaptureView.tsx`, `lib/redux/preferences/userPreferencesSlice.ts`, `migrations/user_preferences_legacy_drift_backfill.sql`, `features/settings/registry.ts`, `app/(core)/transcripts/admin/page.tsx` (admin-map exemplar).
- Server: `aidream/api/routers/files_tus.py`, `aidream/app_config.py`, `aidream/packages/matrx-files/matrx_files/{derivations.py,cloud_sync/transports/tus.py,cloud_sync/processing/thumbnails.py,cloud_sync/sql/018_file_derivation_kind_vocabulary.sql}`, `.../specific_handlers/{thumbnail_source,video_handler,video_compose}.py`, `aidream/api/routers/audio.py`, `packages/matrx-ai/.../processing/audio/stt.py`.
- External: WebKit Safari 18.4 release notes (Image Capture; concrete MediaRecorder formats) — https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ ; MediaRecorder capability probing — https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static ; TUS protocol — https://tus.io/protocols/resumable-upload ; tus-js-client API — https://github.com/tus/tus-js-client/blob/main/docs/api.md ; `setSinkId` — https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId ; `devicechange` availability — https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/devicechange_event ; constraint model — https://www.w3.org/TR/mediacapture-streams/ .
