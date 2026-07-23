# Handoff: Media Capture — state, gap analysis, and the road to full unification

**Owner:** unassigned — written for a junior developer + coding agent picking this up cold.
**Last verified:** 2026-07-22 against live prod (frontend v0.4.16, aidream prod, `files.matrxserver.com`).
**Read before touching `features/media-capture/`, `features/media-devices/`, or any recording/device code.**
**Cross-repo system of record:** `common-docs/systems/media-capture/FEATURE.md` (schemas, TUS wire, server contracts). This doc is the frontend execution + vision handoff; it points there, it does not duplicate it.

> **The next big goal (Arman's, top priority): ONE provider at the very top, above everything.**
> Recording and device state must be impossible to break on a per-route or per-studio basis. Today the audio path already works this way; the video/capture path does not. Closing that asymmetry is the headline work — see §4.

---

## 1. The vision (complete — original brief + everything added along the way)

One capture system for **photos, video, and audio** (the webcam produces all three). It must:

1. **Work for photos AND video** (and the audio a video carries, and standalone audio).
2. **Handle sizing correctly.** Preview size, camera stream size, and saved-file size are three different numbers and must never be conflated. (Origin: the old demo baked one hardcoded size and cropped silently.)
3. **Use the canonical device system** — the *same* camera/mic/speaker selection the audio stack uses, surfaced **in settings AND at the point of capture**. Not a parallel enumerator, not a fake dropdown.
4. **Write straight into the canonical cloud file system** (`fileHandler` → `files.files`). No capture-specific table, no second byte path, no signed-URL persistence.
5. **Be fully managed** — list, filter, rename, move, share, delete, recover interrupted recordings, transcribe.
6. **Have its own home**, like the transcription system — real core utilities, hooks, components, and server APIs, with an admin map.
7. **Hit the `ProTextarea` bar** (added mid-project as the explicit quality standard). ProTextarea's voice affordance is *one pill that is simultaneously the record button, the level meter, and the device picker*; transcription streams **into the destination while you speak**; you **cannot navigate away and silently lose work**; every error has a **"Get Help"** path. Video is not audio — but the *integration standard* is identical.
8. **FULL UNIFICATION under a single top-level provider** (added at the end, now the primary goal). It must be architecturally impossible for a recording or device selection to break because of what route you're on or which studio component mounted. One owner, above everything.

---

## 2. What is LIVE in production (verified 2026-07-22)

Frontend commits `3800452a8` → `d14185406` (shipped across releases; now on v0.4.16). aidream prod + `files.matrxserver.com` standalone both serving.

- **`/camera` — Capture Studio.** Photo / Video / Audio modes. Device rail (camera + mic + speaker) reading/writing the canonical `userPreferences.mediaDevices` store via `useAudioDevices()`. Recording HUD: monotonic pause-aware timer, live level meter off the **real composed stream**, duration + size gauges sharing the exact numbers the hard-stop enforces. Review with playback through the selected speaker. Save → `files.files` under `Captures/{Photos,Videos,Audio}`. One-click **Transcribe** → `POST /audio/transcribe-file`.
- **Capture library** (same page) — filters, per-item actions through the canonical files hooks (open / download / rename / move / share / delete), upload-state chips, failed-upload retry, recovery of interrupted recordings.
- **Media window** (avatar menu → **Media**) — Playback / Recording / **Camera** / Devices tabs; same `overlayId "audioControlWindow"`.
- **`/camera/admin`** — admin-gated feature map + read-only diagnostics; never acquires a camera on open.
- **Live-capture chip + in-app nav guard** — `LiveCaptureIndicator`, mounted app-wide in `app/DeferredSingletons.tsx:271`. A recording survives an attempted **in-app** navigation via a confirm dialog that stops **and saves**; `beforeunload` covers tab close.
- **Settings** → "Camera, microphone & speakers" — the `devices` tab from official settings primitives; the old fake Video-conference camera dropdown is gone.
- **PDF scanner** (`/tools/scanner`) migrated onto this runtime; legacy `components/matrx/camera/` deleted (no shim).
- **Server (all deployed + probed live 2026-07-22):**
  - `POST /audio/transcribe-file` — present in prod OpenAPI ✓. Transcription by owned `file_id`, server-side demux + FLAC re-encode chunking under the provider limit, offset-corrected assembly.
  - `POST /files/{file_id}/extract-audio` — present in prod OpenAPI ✓. `audio_extracted` derivative (migration 020 applied + verified live).
  - Bounded-memory large-media processing (24 GB MP4 probes at +85 MB RSS on the dev box).
  - **Standalone TUS is now live** — `OPTIONS https://files.matrxserver.com/files/upload/tus` → `204` advertising `tus-extension: creation,termination,creation-with-upload`, `tus-max-size: 5368709120`, `tus-resumable: 1.0.0`. matrx-files 0.2.1 has rolled out. *(This was "pending" in the prior handoff — now closed.)*

---

## 3. Gap analysis — vision vs reality

Scored against §1. **The engine and data plane are done and correct; the gaps are UX integration and the unification architecture.**

| # | Vision item | Status | Gap |
|---|---|---|---|
| 1 | Photos + video + audio | ✅ Done | — |
| 2 | Correct sizing | ✅ Done | Three sizes separated in `core/geometry.ts` (`sourceRect`), unit-tested. |
| 3 | Canonical devices at capture point | 🟡 Mostly | Device rail is **three capsules bolted above the controls**, not the integrated ProTextarea pill (§7 gap 1). Sourcing is fully canonical. |
| 4 | Canonical cloud files | ✅ Done | One byte path via `fileHandler`; no capture table. |
| 5 | Fully managed | 🟡 Mostly | Actions all real (canonical file hooks). Library tiles show **no duration/size/date** — poorer than `AudioControlWindow` history rows / `RecordingCard`. |
| 6 | Own home + admin | ✅ Done | `features/media-capture/`, `/camera`, `/camera/admin`, dev harness. |
| 7 | ProTextarea bar | 🟠 Partial | Three real sub-gaps below. |
| 8 | **Single top-level provider** | 🔴 **Not done** | The headline. Video lease ownership is route-scoped. See §4. |

### The ProTextarea-bar gaps (item 7)

1. **Device rail is three capsules, not one integrated pill.** Discoverable, not compact; the Speaker capsule is meaningless while composing a photo. Audio's affordance is a single 28px split-pill. *(UI work.)*
2. **Transcription is a manual button *after* save.** ProTextarea streams results into the destination *during* capture. Here it's Record → Stop → Save → Transcribe (four deliberate steps where audio has zero). *(UX + wiring; live transcription during video needs the chunked path, which the audio stack already has.)*
3. **No save-to-destination parity.** Captures land in `Captures/`; the only onward path is the transcript's `ContentActionBar`. Audio lands results where you were already working.

### The unverified reality (do NOT claim otherwise)

**Nobody has ever watched this record a real video.** Every screenshot during development was the permission-denied state — the agent browser blocks camera and mic hardware. **Unproven end-to-end:** live preview, the HUD with a real ticking timer, the level meter moving off a real stream, the save→upload round trip, transcription returning real text, camera switching between physical cameras, speaker routing actually changing output, and a real large-video TUS upload against the deployed server. **First job for whoever picks this up: drive the happy path on a real device.**

### Other open items

- **`/tools/scanner` was rewritten** onto this runtime (legacy camera engine deleted). Contract preserved *in code* — rear camera, 4096 over-ask, full-frame WYSIWYG, q0.92, native `takePhoto` disabled — but **never verified on a real phone**. This is a tool Arman relies on; a real-device scan is the highest-priority regression check.
- **Browser back/forward bypasses the confirm dialog** (only anchor/`<Link>` clicks are intercepted; `router.push` and history nav fall through to the save-salvage, which stops+uploads rather than losing the file — degraded, not data loss).
- **D81 — analyser duplication.** The canonical `features/audio/useStreamAudioLevel.ts` is consumed only by media-capture. Five+ modules still carry inline `createAnalyser` copies: `MediaDevicesPanel.tsx`, `useSimpleRecorder.ts`, `useChunkedRecordAndTranscribe.ts`, `voice-agent/audio/audioPlayback.ts`, `flashcards/fast-fire/audio/continuousCapture.ts`, `hooks/flashcard-app/useAudioRecorder.ts`. A unification target.

---

## 4. THE HEADLINE GOAL — full unification under one top-level provider

**Arman's requirement, verbatim intent:** a truly single provider at the very top, above everything, so it's impossible to have recording/device issues on a per-route or per-studio basis.

### Where we actually are (evidence-backed — this is good news)

The low-level substrate is **already unification-ready**. Every media manager is a **framework-free module singleton that already survives navigation**:

| Substrate | File | Survives route change |
|---|---|---|
| App-wide capture lock (start-always-wins) | `features/audio/captureLock.ts` (`current` singleton `:47`) | ✅ |
| Single mic (`getUserMedia({audio})`) | `features/audio/micStream.ts` (`:273` the one site) | ✅ |
| Audio session registry | `features/audio/session/audioSessionRegistry.ts` (`:4-9`) | ✅ |
| Single camera stream manager (`getUserMedia({video})`) | `features/media-capture/runtime/camera-stream-manager.ts` (`:333` the one site) | ✅ |
| Capture diagnostics aggregator | `features/media-capture/runtime/mediaCaptureDiagnostics.ts` | ✅ |
| Device manager (mic/speaker/camera + permissions) | `features/media-devices/deviceManager.ts` (`:93`) | ✅ |

The **device layer is already the target shape**: a module singleton (`deviceManager`) + a thin boot provider (`providers/AudioDeviceProviderImpl.tsx`, renders `null`, only starts listeners and applies persisted choices). Copy this shape.

### The one asymmetry to fix

Two recording-ownership models coexist:

- **AUDIO/voice — owned ABOVE the route (correct).** `providers/GlobalRecordingProvider.tsx` is mounted once at app root (`app/Providers.tsx:129`) and holds the single `useChunkedRecordAndTranscribe` instance (`:161`). Because it never unmounts, an audio recording survives any navigation; it holds the lock under one stable id (`GLOBAL_CAPTURE_ID`, `:105`) and mirrors state into Redux so any route can read/control it.
- **VIDEO/capture — owned IN the route (the gap).** `features/media-capture/components/CaptureStudio.tsx` acquires the camera lease inside a `useEffect` (`:363`), stores it in `leaseRef` (`:321`), and **releases it on unmount** (`:393-401`). The recording *bytes* are rescued by a framework-free salvage closure + chunk journal, but the **lease and the recording session die with the route** — you cannot pause/resume/continue a video across a route change the way you can audio. There is **no** `CaptureProvider`/`CameraProvider` at app root.

Symptom of the same asymmetry: `GlobalRecordingIndicator` is hard-gated to `context.kind === "studio"` (`features/transcript-studio/components/recording/GlobalRecordingIndicator.tsx:43`) — Scribe-only. The video path got a *separate* app-root indicator (`LiveCaptureIndicator`) as a stopgap instead of sharing one.

### The recommended shape (do this)

**Build one `MediaCaptureProvider` at app root, mirroring `GlobalRecordingProvider`,** and demote `CaptureStudio` to a pure view that subscribes to it:

1. **Lift lease + recording-handle ownership out of `CaptureStudio`** into the provider (or a new framework-free `capture-session.ts` module singleton the provider hosts, exactly as `GlobalRecordingProvider` hosts the audio recorder). Move `leaseRef`, `recordingRef`, `salvageFnRef`, `unregisterControlsRef` (`CaptureStudio.tsx:321,290,307,311`) up. `CaptureStudio` becomes props/subscription only — it renders the preview + HUD + review for whatever the provider currently owns, and mounting/unmounting the route no longer touches the lease.
2. **Unify the two indicators.** One recording chip for audio AND video capture; either generalize `GlobalRecordingIndicator`'s gate or fold `LiveCaptureIndicator` into it. One idiom, app-wide.
3. **Route guard belongs to the provider, not the studio** — so back/forward and `router.push` are covered too (the current guard only catches anchor clicks because it lives at the indicator layer).
4. **Consider one umbrella `MediaProvider`** that composes the existing hosts (`AudioDeviceProvider`, `GlobalRecordingProvider`, the new `MediaCaptureProvider`, the audio session/playback hosts) into a single top-level mount with a defined order — so "the single provider at the top" is literally one component in `app/Providers.tsx`, and ordering bugs (device-before-recorder, `Providers.tsx:123-127`) become structural, not comment-enforced.
5. **Fold D81** while you're in here: delete the five inline analysers, route them all through `useStreamAudioLevel`.

**Do NOT** re-plumb the low-level managers — they already survive navigation. The work is almost entirely about moving React-layer *ownership* (leases + lifecycle + indicator) above the route. Scope it as: provider + session module + indicator merge + guard move. Estimate it against `GlobalRecordingProvider` as the worked template.

**Product-semantics decision that is Arman's, not the implementer's:** should a video recording literally *keep the camera live and recording* while you browse other routes (true background recording), or should navigating just safely finalize+save (today's behavior, upgraded to cover back/forward)? True background video recording keeps the camera light on app-wide — a privacy and battery decision. Leave it neutral and ask.

---

## 5. Non-negotiable invariants (do not regress)

Full list in `docs/media-capture-plan.md §5`. The ones most likely to be broken by the unification work:

- **One `getUserMedia({video})` site** (`camera-stream-manager.ts`) and **one `getUserMedia({audio})` site** (`micStream.ts`). ESLint `cameraGetUserMediaChokepointBan` enforces the video one. Moving lease ownership must not add a second site.
- **captureLock claimed before any MediaRecorder; takeover = discard.** Mic acquired once, only the *clone* stopped, `releaseMicStream()` exactly once on **every** exit path.
- **Camera stops on last lease release; never prompts at boot.** If a provider holds a lease across navigation, that is a deliberate policy change (see the §4 product decision) — today's invariant is "no keepalive."
- **`canvas.toBlob` only** (no base64); tracked object URLs revoked on every terminal path; emitted Blob MIME is authoritative; **no device IDs / labels in persisted metadata**; one video file per capture.

---

## 6. Process notes — read these, they are load-bearing

- **Run an adversarial review before handing this to Arman.** The first delivery was hollow (mechanically working, no device control/meter/management) and was rejected. Two adversarial passes before the second delivery caught real defects: a permanent blank-screen dead-end (Photo→Video while denied), no retry/Get-Help path, silent recording loss on navigation, mobile stage collapsing below its own chrome, hover-only actions unreachable on touch. **All fixed — but only because skeptics looked. Do the same.**
- **Verify HEAD contains what you think.** Parallel sessions run in this repo constantly and their `git pull --rebase` swept in-flight agent work into their commits twice during this build — once capturing a debug block (`FORCED`/`TEMP-VERIFY` in `LiveCaptureIndicator.tsx`) that would have rendered a fake recording chip on every route and blocked every link app-wide. Caught and removed (verified: zero `FORCED` in HEAD today). Grep for your own sentinels after any release.
- **Docs in this repo are not evidence — test the live thing.** A documented build-profile behavior (`MATRX_PROFILE` strips `(dev)` routes) was quoted as fact to explain a broken page; it was wrong — `/demos/*` returns HTTP 200 in production. Probe the URL, read the live OpenAPI, hit the endpoint. Every factual claim in this handoff was verified against a running system on 2026-07-22, not read from a doc.
- **The agent browser blocks camera/mic.** You cannot prove the happy path from an automated browser. Screenshots will always be the denied state. A human on a real device is the only proof.

---

## 7. Test routes (real device required for the ones that matter)

- **`/camera`** → Video → record 10s with mic → Stop → Save. This one action exercises the whole stack: lease → recorder → journal → upload → files. **The single most important thing to verify.**
- `/camera` → Photo, and Audio-only mode.
- `/camera` → after save, **Transcribe** (needs the live `/audio/transcribe-file`, confirmed present).
- Avatar menu → **Media** (four tabs) · Settings → "Camera, microphone & speakers".
- **`/tools/scanner` on a real phone** — regression check on the rewritten scanner.
- `/camera/admin` · `/demos/media-capture`.
- Start a recording on `/camera`, click a sidebar link → confirm the guard dialog stops+saves (and note whether back/forward is still a gap).

---

## 8. Key files

- **Studio/UI:** `features/media-capture/components/{CaptureStudio,CaptureControls,CaptureDeviceRail,RecordingHud,CaptureReview,CaptureLibrary,CameraControlTab,LiveCaptureIndicator}.tsx`
- **Runtime (framework-free singletons):** `features/media-capture/runtime/{camera-stream-manager,mediaCaptureDiagnostics}.ts`, `features/media-capture/recording/{media-recorder-controller,video-recorder,chunk-journal,journal-recovery}.ts`
- **Devices:** `features/media-devices/deviceManager.ts`, `features/audio/useAudioDevices.ts`, `providers/AudioDeviceProviderImpl.tsx`
- **The unification template:** `providers/GlobalRecordingProvider.tsx` (copy this shape for video)
- **Shared substrate:** `features/audio/{captureLock,micStream,useStreamAudioLevel}.ts`, `features/audio/session/audioSessionRegistry.ts`
- **Transcription client:** `features/audio/services/speechApi.ts` (`transcribeCloudFile`)
- **Plan + contracts:** `docs/media-capture-plan.md`, `common-docs/systems/media-capture/FEATURE.md`
- **Server (aidream):** `docs/handoffs/media-capture-{tus-browser-wire,bounded-processing,transcription-and-derivatives}.md`
