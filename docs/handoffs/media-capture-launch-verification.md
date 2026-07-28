---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: [docs/media-capture-plan.md, /Users/armanisadeghi/code/common-docs/systems/media-capture/FEATURE.md]
---

# Media capture — unification + real-device proof

The engine and data plane are done. Two things remain: **nobody has ever watched this record a
real video**, and **video capture is still owned by the route instead of by a top-level provider**.

## Vision — Arman's words

> ONE provider at the very top, above everything — so it is impossible to have recording or
> device issues on a per-route or per-studio basis. *(Arman, top priority. Intent captured by a
> prior agent, not a verbatim transcript — treat the sentence as the requirement, not the wording.)*

The original brief, in full (all eight still stand):

1. One capture system for **photos, video, and audio** (the webcam produces all three).
2. **Preview size, camera stream size, and saved-file size are three different numbers** and must
   never be conflated. (The old demo baked one hardcoded size and cropped silently.)
3. Use the **canonical device system** — the same camera/mic/speaker selection the audio stack
   uses, surfaced in settings AND at the point of capture. Not a parallel enumerator.
4. Write straight into the **canonical cloud file system** (`fileHandler` → `files.files`). No
   capture-specific table, no second byte path, no signed-URL persistence.
5. **Fully managed** — list, filter, rename, move, share, delete, recover interrupted recordings,
   transcribe.
6. **Its own home**, like the transcription system — core utilities, hooks, components, server
   APIs, admin map.
7. **Hit the `ProTextarea` bar.** Its voice affordance is *one pill that is simultaneously the
   record button, the level meter, and the device picker*; transcription streams **into the
   destination while you speak**; you **cannot navigate away and silently lose work**; every error
   has a **"Get Help"** path. Video is not audio — but the integration standard is identical.
8. **Full unification under a single top-level provider.**

## Resources

- **Contract + change log:** `features/media-capture/FEATURE.md` (read this before the code).
- **Cross-repo system of record:** `/Users/armanisadeghi/code/common-docs/systems/media-capture/FEATURE.md`
  (schemas, TUS wire, server contracts). Plan: `docs/media-capture-plan.md`.
- **Studio/UI:** `features/media-capture/components/` — `CaptureStudio`, `CaptureControls`,
  `CaptureDeviceRail`, `RecordingHud`, `CaptureReview`, `CaptureLibrary`, `CameraControlTab`,
  `LiveCaptureIndicator`, `CaptureItemActions`, `CaptureRecoverySection`, `CaptureTransportStrip`.
- **Framework-free runtime (already survives navigation — do NOT re-plumb):**
  `features/media-capture/runtime/{camera-stream-manager,mediaCaptureDiagnostics,live-capture-nav}.ts`,
  `features/media-capture/recording/{media-recorder-controller,video-recorder,chunk-journal,journal-recovery}.ts`,
  `features/audio/{captureLock,micStream,useStreamAudioLevel,streamLevelMeter}.ts`,
  `features/audio/session/audioSessionRegistry.ts`, `features/media-devices/deviceManager.ts`.
- **The audio-side ownership template (READ IT FIRST — it was rebuilt 2026-07-26):**
  `providers/AudioSystemHost.tsx` + `AudioSystemHostImpl.tsx` — the ENTIRE audio system now mounts
  lazily behind one activation-gated boundary in `app/Providers.tsx`. `GlobalRecordingProvider`'s
  React **context is deleted**; `useGlobalRecording()` is context-free over `recordingsSlice` +
  `features/audio/recordingCommands.ts`, and the engine is `providers/GlobalRecordingEngine.tsx`.
  See `features/audio/FEATURE.md` (top section + `2026-07-26` change-log entry).
- **Indicator mount:** `app/DeferredSingletonCore.tsx:102` (`app/DeferredSingletons.tsx` was
  deleted 2026-07-26 — any doc naming it is stale).
- Routes: `/camera`, `/camera/admin`, `/demos/media-capture`, `/tools/scanner`.
  Settings → "Camera, microphone & speakers" (`features/settings/registry.ts:355`, tab `devices`).
- Transcription client: `features/audio/services/speechApi.ts` (`transcribeCloudFile` →
  `POST /audio/transcribe-file`).
- Server-side handoffs (aidream): `docs/handoffs/media-capture-{tus-browser-wire,bounded-processing,transcription-and-derivatives}.md`.

## Remaining work

1. **Drive the happy path on a real device — before anything else.**
   `/camera` → Video → record 10s with mic → Stop → Save exercises lease → recorder → journal →
   upload → files in one action. Then: Photo mode, Audio mode, post-save **Transcribe**, camera
   switching between physical cameras, speaker routing, a real large-video TUS upload.
   **The agent browser blocks camera and mic — every screenshot during development was the
   permission-denied state. A human on real hardware is the only proof this works.**
2. **`/tools/scanner` on a real phone.** It was rewritten onto this runtime and the legacy
   `components/matrx/camera/` engine deleted. Contract preserved *in code* — rear camera, 4096
   over-ask, full-frame WYSIWYG, q0.92, native `takePhoto` disabled — but never verified on a
   phone. Arman relies on this tool; this is the highest-priority regression check.
3. **THE HEADLINE — lift video ownership above the route.** `CaptureStudio.tsx` acquires the
   camera lease in a `useEffect` (`:338`, stored at `:321`) and **releases it on unmount**
   (`:395-401`). The bytes are rescued by the salvage closure + chunk journal, but the lease and
   the recording session die with the route — you cannot continue a video across a navigation the
   way you can audio. Build a capture host mirroring `AudioSystemHost`/`GlobalRecordingEngine`:
   move `leaseRef`/`recordingRef`/`salvageFnRef`/`unregisterControlsRef` (`:321,290,307,311`) into
   a framework-free `capture-session.ts` singleton the host owns; `CaptureStudio` becomes a pure
   subscriber. **Do NOT re-plumb the low-level managers — they already survive navigation.**
   Keep the invariant of exactly ONE `getUserMedia({video})` site (`camera-stream-manager.ts`,
   ESLint-enforced) and ONE `getUserMedia({audio})` site (`micStream.ts`).
4. **Unify the two recording indicators.** `GlobalRecordingIndicator` is hard-gated to
   `context.kind === "studio"` (`features/transcript-studio/components/recording/GlobalRecordingIndicator.tsx:42`)
   — Scribe-only; video got a separate app-root `LiveCaptureIndicator` as a stopgap. One chip for
   audio AND video.
5. **Move the nav guard to the provider.** `runtime/live-capture-nav.ts` only intercepts anchor
   clicks (`:33`); `router.push` and browser back/forward fall through to the save-salvage
   (stops + uploads — degraded, not data loss). Owning the guard at the host covers all three.
6. **ProTextarea-bar gaps.**
   - Device rail is three capsules bolted above the controls, not one integrated pill. Audio's
     affordance is a single 28px split-pill. The Speaker capsule is meaningless while composing a
     photo.
   - Transcription is a manual button *after* save (Record → Stop → Save → Transcribe = four steps
     where audio has zero). ProTextarea streams into the destination during capture; live video
     transcription needs the chunked path the audio stack already has.
   - No save-to-destination parity — captures land in `Captures/`; the only onward path is the
     transcript's `ContentActionBar`.
7. **Library tiles show no duration/size/date** — poorer than `AudioControlWindow` history rows.
8. **Follow-ups Arman deferred in the 2026-07-26 video/media-controller commit (`27baab955`):**
   a dedicated Video lane/tab in the Media panel; camera-capture single-homing (Recording tab vs
   Camera tab double-projection); research `MediaGallery`/`OutputsStudio` + the public share
   viewer (the `(public)` shell does not mount the audio system).

## Done

- Capture studio, library, Media window Camera tab, `/camera/admin`, settings devices tab, scanner
  migration, live-capture chip + in-app nav guard — see `features/media-capture/FEATURE.md`.
- Server: `POST /audio/transcribe-file` and `POST /files/{file_id}/extract-audio` both live in prod
  OpenAPI; bounded-memory large-media processing; standalone TUS live at `files.matrxserver.com`
  (`OPTIONS /files/upload/tus` → 204 advertising creation/termination/creation-with-upload).
- Video joined the central Media controller — sessions, one-live-playback lock, panel chrome
  (`27baab955`, 2026-07-26).
- D81 analyser duplication is 3/5 done and tracked in `FOUND_DEFECTS.md` (level-meter core
  extracted to `features/audio/streamLevelMeter.ts`). Two inline copies remain:
  `features/audio/hooks/useSimpleRecorder.ts:188`, `hooks/flashcard-app/useAudioRecorder.ts:148`.
  Fold them while doing item 3 — do not re-plan this here.

## Traps

- **Docs in this repo are not evidence — probe the live thing.** A documented build-profile
  behavior (`MATRX_PROFILE` strips `(dev)` routes) was quoted as fact to explain a broken page and
  was simply wrong; `/demos/*` returns 200 in production.
- **Verify HEAD contains what you think.** Parallel sessions in this repo swept in-flight agent
  work into their commits twice during this build — once capturing a `FORCED`/`TEMP-VERIFY` debug
  block in `LiveCaptureIndicator.tsx` that would have rendered a fake recording chip on every route
  and blocked every link app-wide. Grep for your own sentinels after any release.
- **Run an adversarial review before handing anything here to Arman.** The first delivery was
  mechanically working with no device control, meter, or management, and was rejected.

## Decisions needed

**Should a video recording keep the camera live while you browse other routes?**
Situation: today, navigating away from the camera page safely finalizes and saves the video —
the recording ends. The alternative is true background recording, where the camera stays on and
keeps recording while you use the rest of the app. That keeps the camera light on app-wide, which
is a privacy and battery tradeoff, not a technical one.
Decide: keep "navigate away = finalize and save" (and just extend it to cover browser
back/forward), or make video recording continue in the background like audio does.
