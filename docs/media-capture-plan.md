# Media Capture System — Official End-to-End Plan

**Status:** Ratified plan, ready for execution. Supersedes the earlier research draft in this file.
**Date:** 2026-07-21
**Scope:** One platform-grade capture system for **photos, video, and audio** — camera/mic/speaker device management unified in settings, correct sizing, cloud-file integration, full management surfaces — on desktop and mobile browsers.

Every claim below was verified against live code in matrx-frontend and aidream on 2026-07-21. Corrections to the earlier draft are marked **[CORRECTED]**.

---

## 0. Verified ground truth (what exists, what's wrong, what's missing)

### Exists and is the foundation (reuse, never fork)

| Primitive | Location | Role for capture |
|---|---|---|
| Capture lock (ONE live capture app-wide, start-always-wins) | `features/audio/captureLock.ts` | Video recorder MUST `claimCapture` before opening a MediaRecorder; takeover = discard |
| Shared mic singleton (the only legal `getUserMedia({audio})`) | `features/audio/micStream.ts` | Video-with-audio clones/references the shared mic track; never independent audio gUM, never `track.stop()` |
| Audio session registry | `features/audio/session/audioSessionRegistry.ts` | Recording sessions register via `beginRecordingSession`; feeds the Audio/Media control window |
| Device manager (mic+speaker) | `features/audio/audioDevices.ts` | id+label persistence, `resolveDeviceId` (id→label→default), Chrome permissions.query / Safari-infer split, `devicechange`, referentially-stable snapshots |
| Output sink store | `features/audio/audioOutputSink.ts` + `useOutputSinkRef` | Review playback routes through the selected speaker (Safari no-ops, feature-detected) |
| Device preferences | `userPreferences.audioDevices` module (`lib/redux/preferences/userPreferencesSlice.ts` ~L456) | Flat `{audioInputDeviceId/Label, audioOutputDeviceId/Label}`, `""` = default, synced tier |
| Devices UI panel | `features/audio/components/devices/AudioDevicesPanel.tsx` | Mic/speaker selects, permission row, live meter, speaker test — the panel to extend with camera |
| Audio control window | `features/window-panels/windows/AudioControlWindow.tsx`, overlayId `"audioControlWindow"`, openers `features/overlays/openers/audioControlWindow.tsx` | Expands into the Media control window (same overlayId) |
| Universal file handler | `features/files/handler/handler.ts` — `fileHandler.upload({kind:"blob"|"file"}, opts)` | The ONLY cloud boundary. `UploadOpts.metadata` flows verbatim to `files.files.metadata` JSONB — `metadata.capture` works today, no new FileSource variant needed |
| Object-URL registry | `lib/media/object-url-registry.ts` | All local preview URLs (`createTrackedObjectUrl`), never raw `URL.createObjectURL` |
| Durable rendering | `<InlineMediaRef>` + `lib/media/{signed-url,durability}.ts` | Persist `file_id`, never signed URLs; renders re-mint on failure |
| File actions / mutations | `features/files/hooks/useFileMutation.ts`, `useSharing.ts`, `FileContextMenu`, `FilePreview` | The `/camera` list page reuses these wholesale |
| Folder conventions | `features/files/utils/folder-conventions.ts` (`CloudFolders`) | Add `CAPTURES` constants here; never hand-roll paths |
| Crash-safety stores | `features/audio/services/audioSafetyStore.ts` (IndexedDB), `audioChunkJournal.ts` | The pattern (and code) to generalize for video chunk journaling |
| DB columns | `files.files`: `parent_file_id`, `derivation_kind`, `width`, `height`, `duration_ms`, `metadata` JSONB, `visibility`, soft delete | **No new capture table is needed** |
| Server probing/derivatives (aidream `packages/matrx-files`) | `cloud_sync/processing/thumbnails.py`, `specific_handlers/thumbnail_source.py` | Image/video/audio dims+duration probed; video `poster_url` (OpenCV frame @10%); audio waveform PNG (pydub); ffmpeg present via imageio-ffmpeg |
| Server TUS engine + routes (aidream host) | `aidream/api/routers/files_tus.py` → `/files/upload/tus`, `TUSSessionManager`, `files.uploads_inflight` | 5 GB cap, resume via HEAD/Upload-Offset, idempotency, dedup. Live on the host today |
| Legacy camera engine | `components/matrx/camera/` (5 files) | Only TWO consumers: the dev demo and the PDF scanner's `CaptureView`. Replace and delete |

### [CORRECTED] Draft claims that were wrong

1. **`ImageCapture.takePhoto()` is NOT in stable Safari** (the draft said Safari 18.4 added it; as of July 2026 takePhoto/grabFrame remain unshipped in stable Safari, Firefox flag-only). Canvas capture is the **primary** photo path everywhere; `takePhoto()` is Chromium-only progressive enhancement.
2. **MP4/H.264 recording in Chrome is platform-encoder dependent** — the runtime `MediaRecorder.isTypeSupported()` ladder is mandatory, never assume MP4.
3. **The real mic/speaker pickers are NOT in Settings** — they live in the `audioControlWindow` overlay's Devices tab (`AudioDevicesPanel`), reached from the avatar menu. Settings has only enable/disable switches (`voice.input`) plus the **fake** Video-conference camera dropdown (`communication.video`, hardcoded Front/Rear/External, not `enumerateDevices`). The unification is: shared panel + real settings tab + expanded control window — not "fix a settings split."
4. **The mic/speaker preference migration is already DONE** (`videoConference.defaultMicrophone/defaultSpeaker` were deleted with a paired backfill). The only legacy field left is `videoConference.defaultCamera` (fake enum). The preference migration in this plan is therefore small — but it MUST follow the established paired-backfill doctrine (see Phase 2).
5. **`features/audio/FEATURE.md` is stale in two places** — the global AudioContext `setSinkId` monkeypatch is deleted (routing lives in `useOutputSinkRef` + `SinkAwarePlayer`), and "tests" overstates coverage (only `sinkAwarePlayer.test.ts` exists; captureLock/micStream/audioDevices are untested). Do not build on the stale claims; fix the doc in Phase 1.
6. **`react-media-recorder` is an installed, zero-import dead dependency.** Remove it; use native `MediaRecorder`.
7. **`features/files/index.ts` claims "auto buffered/presigned/TUS" upload — it's aspirational.** There is NO TUS client in the frontend; every upload is one buffered multipart XHR. Fix the comment when the real transport policy ships (Phase 6).
8. **The standalone matrx-files service has NO TUS routes** (engine is in the package; the HTTP router is host-coupled in aidream). Aidream host TUS is live; standalone parity is a server-side work order, not a frontend blocker (standalone is a hot standby with no production traffic).
9. **Transcription has NO file_id path today** — `/audio/transcribe` (multipart) and `/audio/transcribe-url` (whitelisted URL) only. File-id transcription is a small, clean aidream addition (work order below).
10. **No audio-demux capability exists server-side** and no `audio_extracted` derivation kind exists (`derivations.py::FileDerivationKind` has no audio/video kinds). ffmpeg is present; the feature is net-new server work (work order below).
11. **EXIF nuance:** canvas-captured photos have no EXIF at all (canvas re-encode strips it). The EXIF/GPS-stripping concern applies only to **imported** photos (the `<input capture>` OS-camera fallback and file imports). The server `exif_strip` image op exists (`image_ops/geometry.py`) but is an Image Studio op, not an auto pipeline step.

### The PDF scanner contract (the one production consumer that must not break)

`features/pdf/scanner/components/CaptureView.tsx` requires, exactly:
- `facingMode: { ideal: "environment" }`, resolution over-ask (`width/height ideal 4096`, no aspectRatio) to get the native sensor frame.
- **Full-frame WYSIWYG**: whole-sensor capture matching an `object-contain` letterboxed preview — including the inline-style workaround for the global mobile CSS rule `img, video, iframe { height: auto }` that otherwise breaks the letterbox (`camera-view.tsx` L50–60).
- Per-shot `onCapture` at JPEG quality 0.92 (today a data URL; migrate the scanner to Blob + tracked object URL as part of Phase 5).
- `switchCamera` / `numberOfCameras`, `notSupported` / `permissionDenied` states, and the `<input type="file" accept="image/*" capture="environment">` OS-camera fallback for blocked webviews.

---

## 1. Target architecture

```
Settings tab "Camera, microphone & speakers" ─┐
Media control window (overlayId audioControlWindow) ─┤→ MediaDevicesPanel (shared)
Capture Studio ───────────────────────────────┘         │
                                                        ▼
                              features/audio/audioDevices.ts (GENERALIZED: cameras added)
                              micStream.ts · captureLock.ts · audioSessionRegistry
                                                        │
        features/media-capture  ◄───────────────────────┘
        core (types·geometry·constraints·mime) / runtime (camera stream manager)
        recording (video recorder · chunk journal) / hooks / components (Capture Studio)
                                                        │ Blob/File + metadata.capture
                                                        ▼
        fileHandler.upload  ──(small: buffered multipart)──►  aidream /files/upload
                            ──(large: TUS, NEW client)──────►  aidream /files/upload/tus
                                                        │
                                          files.files rows (Captures/Photos·Videos·Audio)
                                          probe: width/height/duration · poster · waveform
                                                        │
        /camera list page · <InlineMediaRef> · file actions · /camera/admin
```

**Decisions locked in (deviations from the draft, per reuse-first):**

- **No new `features/media-devices` feature and no big-bang audio migration.** Instead, **generalize `features/audio/audioDevices.ts` in place** to also enumerate `videoinput` and track camera permission. It already calls `enumerateDevices` and has the snapshot/subscription/resolution machinery; adding `cameras: AudioDeviceInfo[]` to the snapshot and a camera-permission watcher extends the existing primitive instead of creating a parallel enumerator. All existing exports stay intact.
- **No new DB table.** `files.files` + `metadata.capture` + folder conventions cover ownership, lifecycle, dimensions, duration, thumbnails, lineage, sharing.
- **The capture feature home is `features/media-capture/`; the route family is `app/(core)/camera/`** (list-view entry page per the feature-entry doctrine, `/camera/admin` FeatureAdminMap).
- **Audio-only capture mode delegates to the existing audio recorders** (`useSimpleRecorder` family) — the studio adds a mode, not a recorder.
- **Photos are canvas-first everywhere**; `ImageCapture.takePhoto()` is a Chromium-only enhancement behind feature detection.

---

## 2. Execution phases

Each phase ends green (`pnpm type-check`, `pnpm check:doctrine`, relevant checks) and lists **exact routes to test**. Phases 1–5 are pure frontend; 6–8 include aidream work orders.

### Phase 1 — Contracts + device-layer generalization

**Build:**
1. `features/media-capture/FEATURE.md` — status, core-storage contract (bytes → `files.files` via `fileHandler`, no third store), invariants, the capture metadata schema, framing modes, and the geometry model (all below), before any code.
2. Generalize `features/audio/audioDevices.ts`:
   - Snapshot gains `cameras: AudioDeviceInfo[]` (same `{deviceId, label, groupId}` shape) and `cameraPermissionState`.
   - Camera permission: `permissions.query({name:"camera"})` on Chromium with subscription; Safari inferred from the last camera `getUserMedia` result (mirror the mic split exactly).
   - `ensureCameraPermission()` — prompts only when needed, via the camera stream manager (Phase 4), never a throwaway gUM. **Never prompt for camera at app boot** — labels-blank-before-grant is accepted; a camera indicator at load is a privacy regression.
   - Reuse `resolveDeviceId` for cameras (id → label → default); reuse the single `devicechange` listener.
   - Keep every existing export and the referentially-stable-snapshot rule (`useSyncExternalStore`).
3. **Add the missing tests while in there** (the audit found zero): unit tests for `resolveDeviceId`, `captureLock` claim/takeover/release, and the new camera snapshot logic.
4. Fix the two stale claims in `features/audio/FEATURE.md` (monkeypatch gone; honest test coverage) — context-docs rules apply.
5. Remove the dead `react-media-recorder` dependency.

**Capture metadata contract (v1, frozen in FEATURE.md):**

```ts
metadata.capture = {
  version: 1,
  source: "webcam" | "capture-input" | "import",
  artifactKind: "photo" | "video" | "audio",
  capturedAt: string,            // ISO
  hasAudio: boolean,
  facingMode: "user" | "environment" | null,
  width: number, height: number, // intrinsic, from track settings / videoWidth
  frameRate: number | null,
  framing: "full-frame" | "viewport-crop",
  mirroredOutput: boolean,
  recorderMimeType?: string,     // exact recorder.mimeType for video/audio
  sourceFeature: string,         // "camera" | "pdf-scanner" | ...
};
// NEVER persisted: deviceId, groupId, device labels (hardware-identifying).
```

**Test:** `pnpm type-check`, new unit tests, `/administration` unaffected; audio panel (avatar menu → Audio → Devices) unchanged.

### Phase 2 — Preference migration + unified settings

**Build:**
1. New `userPreferences.mediaDevices` module (flat, matching house style):
   ```ts
   interface MediaDevicePreferences {
     audioInputDeviceId: string;  audioInputDeviceLabel: string;
     audioOutputDeviceId: string; audioOutputDeviceLabel: string;
     videoInputDeviceId: string;  videoInputDeviceLabel: string;
     preferredFacingMode: "user" | "environment" | "";   // "" = auto
   }
   ```
   Absorbs `audioDevices` (field-for-field) and replaces `videoConference.defaultCamera` (fake enum → dropped; no value mapping possible or needed).
2. **Paired backfill — non-negotiable, same change** (the settings-system doctrine):
   - TS: rule in `sanitizeLoadedPreferences()` (`userPreferencesSlice.ts` ~L652) — lift `audioDevices` → `mediaDevices`, drop `videoConference.defaultCamera`, loud warn.
   - SQL: **new rule added** to `users.normalize_preferences_jsonb` (never edit frozen rules) in a new migration; reaper `users.heal_user_preferences_drift()` covers it; applied live via Supabase MCP + ledger upsert + `pnpm db-types`.
   - Integrity: extend the `user-preferences-legacy-drift` check in `lib/integrity/checks.ts`; verify 0 drift at `/administration/data-integrity`.
3. Flip all consumers of `selectAudioDevicePreferences` / per-field selectors to the new module in the same change (bounded: `useAudioDevices.ts`, `AudioDeviceProviderImpl`, panel). Delete the `audioDevices` module — no compat reads beyond the sanitizer.
4. **`MediaDevicesPanel`** — extend `AudioDevicesPanel` (same file lineage, renamed) with a camera section: camera select (real `enumerateDevices`), independent camera-permission row + Grant button, **opt-in** live preview tile (small, explicit button — never auto-starts), effective resolution/frame-rate readout once a stream runs. Mic meter + speaker test unchanged.
5. **Settings tab** `devices` ("Camera, microphone & speakers"): register in `features/settings/registry.ts`, `persistence: "synced"`, component embeds `MediaDevicesPanel` (shared-panel pattern, exactly like flashcards embed it). Add deep-link alias in both `LEGACY_TAB_MAP` and `LEGACY_TAB_ALIASES`.
6. `VideoConferenceTab`: remove the fake camera selector; keep meeting prefs; add a link chip to the new devices tab.

**Test routes:** avatar menu → Audio → Devices (mic/speaker still work, camera picker appears); Settings → "Camera, microphone & speakers"; Settings → Video conference (no fake dropdown); `/administration/data-integrity` (drift = 0). Verify saved camera survives reload and iOS-style deviceId churn (label fallback).

### Phase 3 — Capture core: geometry, constraints, MIME (pure, unit-tested)

**Build `features/media-capture/core/`** — all pure TS, no DOM side effects, fully unit-tested:
- `capture-types.ts` — the contracts from Phase 1.
- `geometry.ts` — `sourceRect(containerW, containerH, videoW, videoH, framing)` mapping a cover-cropped preview back to source pixels; identity for `full-frame`. **The three sizes are always separate:** preview container size (layout, `ResizeObserver`), stream intrinsic size (`video.videoWidth/videoHeight` — NEVER `offsetWidth/offsetHeight`), and persisted output size (from the capture canvas / track settings). Unit tests cover letterbox, pillarbox, DPR-independence, rotation swap.
- `constraints.ts` — builds `MediaTrackConstraints` from preference + quality profile; models **requested vs capability vs effective** separately (per the Media Capture spec); `applyConstraints()` for compatible quality changes, reacquire only on device/facingMode change.
- `mime-selection.ts` — runtime recording-format ladder via `MediaRecorder.isTypeSupported()`:
  1. `video/mp4;codecs=avc1.*,mp4a.*` (Safari always; Chromium only where the OS encoder exists)
  2. `video/webm;codecs=vp9,opus`
  3. `video/webm;codecs=vp8,opus`
  4. browser default
  Records the exact `recorder.mimeType` → file extension map. Audio-only ladder analogous (`audio/mp4` / `audio/webm;codecs=opus`), shared with `utils/audio-mime.ts` (extend, don't fork).
- Quality profiles: `sensor` (full), `1080p` (default), `720p` (data saver).

**Test:** unit tests only (`geometry`, `mime-selection`, `constraints`) — this phase has no UI.

### Phase 4 — Camera stream manager + photo capture + Capture Studio (photos)

**Build:**
- `runtime/camera-stream-manager.ts` — the ONE legal `getUserMedia({video})` call site (mirror of `micStream.ts`): ref-counted preview leases (shareable), preferred-device from `mediaDevices` prefs applied on next acquire, **camera stops immediately when the last lease closes** (no keepalive — camera light ≠ mic), track-health watchers (`ended`/`mute`), interruption channel, `pagehide` leak scream. Recording **pins** the device+constraints; device switching while recording is blocked with a visible explanation.
- `components/CameraPreview.tsx` — renders the `<video>`; `full-frame` (object-contain letterbox, with the inline-style guard against the global mobile `height:auto` CSS rule) and `viewport-crop` (object-cover) modes; front-camera mirror is **preview-only** (CSS transform), output unmirrored unless requested; re-reads intrinsic dims on `resize`/orientation.
- `hooks/usePhotoCapture.ts` — canvas path: draw `sourceRect(...)` region → `canvas.toBlob("image/jpeg", q)` (**never base64/data URLs**); Chromium enhancement: `ImageCapture.takePhoto()` behind feature detection with canvas fallback; correct `File` naming (`capture-2026-07-21T…​.jpg`).
- `components/DeviceFallbackInput.tsx` — the `<input type="file" accept="image/*" capture>` OS-camera path (webviews, no-gUM browsers) normalized into the same output contract, tagged `source: "capture-input"`. Imported photos get EXIF orientation applied + GPS/EXIF stripped **before** any shareable object exists (client-side re-encode through the same canvas path).
- `upload/capture-uploader.ts` — builds `metadata.capture`, resolves the folder via new `CloudFolders.CAPTURES_PHOTOS/VIDEOS/AUDIO` constants (+ descriptions + visibility rule in `folder-conventions.ts`), calls `fileHandler.upload({kind:"blob"|"file"}, …)`. Review previews via `createTrackedObjectUrl`; on save, swap to `<InlineMediaRef>` by `file_id`.
- `components/CaptureStudio.tsx` + `CaptureControls` + `CaptureReview` — photo mode first: preview → shutter → review (retake / download / save) → saved state with the durable ref. Explicit terminal errors: permission denied, device removed, stream ended, not supported.
- Route `app/(core)/camera/` scaffold per core-route rules: `page.tsx` (SSR auth gate) + `layout.tsx` (`createRouteMetadata`, unique letter) + `loading.tsx`; body `h-full overflow-hidden`, chrome via `<PageHeader>`; mobile per ios-mobile-first. `/camera` renders the list page shell (Phase 7 fills it) with a "New capture" button opening the studio.

**Test routes:** `/camera` (new capture → photo → review → save → appears with real dimensions in DB and renders via InlineMediaRef); verify saved file lands in `Captures/Photos`, `files.files.width/height` populated by the server probe, thumbnail arrives; deny-permission and no-camera paths show explicit states; mobile viewport (front/rear switch, mirror preview-only).

### Phase 5 — PDF scanner migration + legacy deletion

**Build:**
1. Migrate `features/pdf/scanner/components/CaptureView.tsx` onto the new runtime: full-frame framing mode, environment facing, sensor over-ask, per-shot Blob capture at q=0.92 (scanner internals updated from data URLs to Blobs + tracked object URLs), fallback input preserved. **Pixel-comparison check:** captured frame dimensions must equal `videoWidth×videoHeight` (WYSIWYG), letterboxed preview visually matches output.
2. Delete `components/matrx/camera/` (all five files) and `app/(dev)/demos/tests/camera-test/` after repo-wide import verification — no shims, no re-exports (no-legacy doctrine).
3. New dev harness `app/(dev)/demos/media-capture/page.dev.tsx` exercising the production primitives (framing modes, quality profiles, device switching, error states) — the demo consumes the platform, not the reverse.

**Test routes:** `/tools/scanner` (mobile + desktop: capture → review → save to PDF extractor unchanged); `/demos/media-capture`.

### Phase 6 — Video + audio recording, chunk journal, TUS transport

**Build (frontend):**
1. `recording/video-recorder.ts` — native `MediaRecorder` over a composed stream: pinned camera track + (optional) **cloned** shared-mic track (`micStream` acquire, clone, never stop the source track). Claims `captureLock` (holder id `media-capture-recording`; takeover = discard, never auto-deliver a partial blob). Registers via `beginRecordingSession`; state machine start/pause/resume/stop/cancel; monotonic elapsed timer (`performance.now()`, **never** derived from `dataavailable` cadence — browsers batch/delay chunks under lock/suspend); max-duration + estimated-size limits; handlers for `track.ended`/`mute`/`unmute`, visibility, pagehide, device removal.
2. `recording/chunk-journal.ts` — generalize the `audioSafetyStore` IndexedDB pattern into a shared capture-safety store (one primitive; audio keeps using it) journaling recorder chunks for crash/tab-close recovery; recovery surfaces on next studio open ("finish or discard"); idempotent finalization; storage-quota errors explicit.
3. Audio-only mode: studio mode that delegates to the existing audio recorder stack, output saved through the same uploader into `Captures/Audio`.
4. Review playback: `<video>`/`<audio>` element routed through `useOutputSinkRef` (selected speaker), registered as a playback session.
5. **TUS transport in `fileHandler`:** add `tus-js-client`; transport policy inside `upload.ts`/`cloudUpload` — buffered multipart below a threshold (default 80 MB), TUS at `{PYTHON_BACKEND}/files/upload/tus` above it. Same `NormalizedFile` return, same progress events into the `cloudFiles` slice, resume journal (persist TUS upload URL keyed by file fingerprint; on relaunch offer resume via `HEAD`/`Upload-Offset`), retry, cancellation via `AbortSignal`, `X-Idempotency-Key` on create. Fix the stale "auto buffered/presigned/TUS" comment in `features/files/index.ts` and update `features/files/handler/FEATURE.md`.

**Output-type doctrine:** photo → one image file; video (±audio) → **one** video file (audio stays a track; never auto-create a duplicate standalone audio file); audio-only → one audio file. Audio extraction is an explicit server derivative (Phase 8).

**Test routes:** `/camera` studio — record video w/ mic (verify one file, `hasAudio: true`, exact `recorderMimeType` persisted, duration probed server-side, poster generated); video w/o mic; audio-only (waveform thumbnail); pause/resume; cancel; a >100 MB recording uploads via TUS with progress and survives a mid-upload reload (resume prompt); starting a recording while a transcript recording runs takes the lock over loudly; tab-background + phone-lock during recording produce a recoverable journal, not a corrupt file.

### Phase 7 — `/camera` management surfaces + Media control window

**Build:**
1. `/camera` list page (feature entry = LIST view doctrine): recent captures (query `files.files` under `Captures/` + `metadata.capture` marker, direct supabase-js — never through Python), photo/video/audio filters, upload-state chips + failed-upload retry (from the `cloudFiles` slice + TUS journal), open in the existing file viewer (`/files/f/[fileId]`), rename/move/share/download/delete via `useFileMutation`/`useSharing`/existing menus. Optionally add a `"captures"` `CloudFilesSection` so `/files` gains the same lens.
2. Expand `AudioControlWindow` → **Media control window**: same overlayId `"audioControlWindow"` and openers (zero breakage), title "Media", tabs Playback / Recording / **Camera** / Devices; Camera tab shows active leases, recording-lock owner, live capture state; Devices tab is the shared `MediaDevicesPanel`. Update avatar-menu label/icon.
3. `/camera/admin` — `FeatureAdminPage` map (`routeScanPath: "app/(core)/camera"`) listing routes, panels, overlays, components, slices, demo route, plus live diagnostics: supported APIs/codecs (the isTypeSupported ladder results), permission states, detected devices, applied track settings, lease/lock owners, transport state, recoverable journals, recent capture failures.

**Test routes:** `/camera` (filters, actions, failed-upload recovery), `/camera/admin`, avatar menu → Media (all four tabs), `/files` still green.

### Phase 8 — Server work orders (aidream) + integration finish

Three bounded work orders for the aidream agent (hand-off prompts below); frontend integrates as each lands:

1. **Transcription by `file_id`:** add `file_id` to the transcription request (`TranscriptionUrlRequest` sibling or field; `extra="forbid"` models make this clean) — resolve through the file access gate, read bytes or mint internally, call `transcribe_audio`. FE: "Transcribe" action on captured video/audio rows sends `file_id` — the client never mints a signed URL just to hand it back to the same server.
2. **Audio-extraction derivative:** new `FileDerivationKind` `audio_extracted` (enum + `files.files` check-constraint migration in lockstep — the test suite enforces it), ffmpeg demux (`-vn`) writing a child row via the managed write path with `parent_file_id`, exposed as a file endpoint; the processor then probes duration + waveform automatically. FE: explicit "Extract audio" action on video captures; lineage visible in the viewer.
3. **TUS router parity in `packages/matrx-files`:** port `files_tus.py` into a `build_tus_router` package factory (host deps → injected callables), mount in `standalone/app.py` (CORS headers already anticipate it), update the cross-repo wire-contract table. Not a launch blocker (standalone is a hot standby) — schedule before any traffic cutover.

**Also in this phase:** wire the server `exif_strip` op into an import preset for capture-input/imported photos if the client-side re-encode is ever bypassed (belt-and-suspenders), and run `pnpm sync-types` after any server contract change.

---

## 3. Hard rules (the invariants, enforced)

1. **One `getUserMedia({video})` call site** — the camera stream manager. ESLint restriction mirroring the mic rule.
2. **One live capture app-wide** — `captureLock` claimed before any MediaRecorder; takeover = discard.
3. **Mic access only via `micStream`** — clone tracks for recording; never stop the shared track; never independent `getUserMedia({audio:true})`.
4. Camera stops when the last lease closes. No keepalive. No boot-time camera prompt, ever.
5. Intrinsic dimensions from `videoWidth/videoHeight` / track settings — never element offsets. Preview size, stream size, output size never conflated.
6. `canvas.toBlob()` and Blob/File everywhere — base64/data URLs banned in the capture pipeline.
7. Bytes go through `fileHandler.upload` only; previews through the object-URL registry; renders through `<InlineMediaRef>`; persist `file_id`, never signed URLs; no `/api/camera/*` Next.js routes; no capture-specific storage.
8. No device IDs, group IDs, or hardware labels in persisted file metadata.
9. One video file per video capture — audio duplication only as an explicit server-side derivative with lineage.
10. Every terminal error explicit and user-visible: permission denied, device removed, stream ended, unsupported codec, storage quota, upload failure, mic conflict, lock takeover.
11. Every recovery path screams (loud-recovery doctrine): journal recovery, URL re-mint, upload resume.

## 4. Release gates

- `pnpm type-check`, `pnpm check:doctrine`, `pnpm check:page-headers`, `pnpm check:migrations`, `pnpm check:release-gates` — run, not assumed.
- Browser matrix: Chrome/Edge/Firefox/Safari desktop; Safari iOS + Chrome Android (real devices — simulated streams do not count as verification).
- Scenario matrix: front/rear/external/unplugged cameras; rotation during preview AND recording; full-frame (scanner) vs viewport-crop pixel comparisons; camera-only / video-only / video+mic; permission combinations (camera granted+mic denied, etc.); lock contention with a live transcript recording; tab background, phone lock, track interruption, route unmount mid-recording; >100 MB TUS upload with forced interruption + resume; cloud metadata/poster/dimensions/duration/waveform/permissions verified in the live DB; extracted-audio lineage + file-id transcription (post Phase 8).
- Hygiene: zero leaked object URLs, live tracks, IndexedDB chunks, or lock claims after unmount (admin diagnostics prove it); no signed URLs persisted anywhere (durability guard silent); legacy camera fully deleted, `react-media-recorder` gone.
- Docs: `features/media-capture/FEATURE.md` current; `features/audio/FEATURE.md` stale claims fixed; `features/files/handler/FEATURE.md` transport policy documented; admin map complete.

## 5. Key references

- Frontend foundations: `features/audio/{captureLock,micStream,audioDevices,audioOutputSink}.ts`, `features/audio/session/audioSessionRegistry.ts`, `features/audio/components/devices/AudioDevicesPanel.tsx`, `features/files/handler/{handler,upload,types}.ts`, `features/files/utils/folder-conventions.ts`, `lib/media/{object-url-registry,signed-url,durability}.ts`, `features/pdf/scanner/components/CaptureView.tsx`, `lib/redux/preferences/userPreferencesSlice.ts`, `migrations/user_preferences_legacy_drift_backfill.sql`, `features/settings/registry.ts`, `app/(core)/transcripts/admin/page.tsx` (admin-map exemplar).
- Server: `aidream/api/routers/files_tus.py`, `aidream/packages/matrx-files/matrx_files/cloud_sync/{transports/tus.py,processing/thumbnails.py,derivations.py}`, `.../specific_handlers/{thumbnail_source,video_handler,video_compose}.py`, `aidream/api/routers/audio.py`.
- External (verified July 2026): MediaRecorder `isTypeSupported` per-browser divergence and Chrome's OS-encoder-gated MP4 ([caniuse](https://caniuse.com/mediarecorder), [WebKit](https://webkit.org/blog/11353/mediarecorder-api/), [Chrome Platform Status](https://chromestatus.com/feature/5163469011943424)); ImageCapture unshipped in stable Safari, flag-only Firefox ([caniuse](https://caniuse.com/imagecapture)); `setSinkId` feature-detect ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId)); `devicechange` availability caveat ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/devicechange_event)); requested/capability/effective constraint model ([W3C](https://www.w3.org/TR/mediacapture-streams/)).
